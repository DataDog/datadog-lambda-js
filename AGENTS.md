# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the Datadog Lambda Library for Node.js, which enables enhanced Lambda metrics, distributed tracing, and custom metric submission from AWS Lambda functions. The library wraps Lambda handlers to provide automatic instrumentation and telemetry collection.

## Development Commands

### Building
```bash
npm run build          # Compile TypeScript to dist/
yarn build             # Alternative using yarn
```

### Testing
```bash
npm test               # Run all Jest tests
npm run test:watch     # Run tests in watch mode
yarn test              # Alternative using yarn
```

### Linting and Formatting
```bash
npm run lint                 # Lint with TSLint
npm run check-formatting     # Check code formatting with Prettier
npm run format              # Format code with Prettier
```

### Integration Tests
```bash
# Run integration tests against AWS account and Datadog org
BUILD_LAYERS=true DD_API_KEY=<api-key> ./scripts/run_integration_tests.sh

# Update integration test snapshots
UPDATE_SNAPSHOTS=true DD_API_KEY=<api-key> ./scripts/run_integration_tests.sh
```

### Building and Publishing Layers
```bash
# Build Lambda layers using Docker
./scripts/build_layers.sh

# Publish layer to AWS region (returns ARN)
./scripts/publish_layers.sh <AWS_REGION>
```

### Local Testing with yarn link
```bash
yarn build
cd dist
yarn link
cd /path/to/testing/function
yarn link "datadog-lambda-js"  # use yarn unlink when done
```

## Architecture

### Core Components

**Main Entry Point (`src/index.ts`)**
- `datadog()` wrapper function that instruments Lambda handlers
- Manages configuration via environment variables and Config object
- Coordinates MetricsListener and TraceListener lifecycle
- Handles both standard handlers and Response Streaming handlers

**Listener Pattern**
The library uses two main listeners that hook into Lambda invocation lifecycle:

1. **MetricsListener** (`src/metrics/listener.ts`)
   - Collects and sends custom metrics and enhanced metrics
   - Supports three delivery methods:
     - Datadog Extension (via StatsD on localhost:8125)
     - Direct API submission (with KMS/Secrets Manager support)
     - Log forwarding (writes to stdout for Forwarder)
   - Manages metrics batching and flushing

2. **TraceListener** (`src/trace/listener.ts`)
   - Creates and manages distributed tracing spans
   - Extracts trace context from various AWS event sources
   - Supports cold start tracing
   - Handles X-Ray integration when enabled
   - Creates inferred spans for managed services (SQS, SNS, etc.)

### Directory Structure

- **`src/metrics/`** - Metric collection and submission
  - `batcher.ts` - Batches metrics for API submission
  - `dogstatsd.ts` - StatsD client for Extension communication
  - `enhanced-metrics.ts` - AWS Lambda integration metrics
  - `extension.ts` - Extension detection and communication
  - `kms-service.ts` - API key decryption via KMS
  - `api.ts` - Direct Datadog API submission

- **`src/trace/`** - Distributed tracing functionality
  - `tracer-wrapper.ts` - Wraps dd-trace for Lambda
  - `span-wrapper.ts` - Span lifecycle management
  - `span-inferrer.ts` - Creates inferred spans for AWS services
  - `cold-start-tracer.ts` - Traces module load during cold starts
  - `patch-http.ts` - Auto-instruments HTTP requests
  - `patch-console.ts` - Injects trace context into logs
  - `trigger.ts` - Extracts tags from Lambda event sources
  - `xray-service.ts` - X-Ray trace merging
  - `context/` - Trace context extraction from various AWS event types
    - `extractors/` - Event-specific extractors (SQS, SNS, API Gateway, etc.)

- **`src/runtime/`** - Cold start tracing infrastructure
  - `require-tracer.ts` - Hooks into Node.js module loading via diagnostics_channel
  - `user-function.ts` - Loads user handler functions

- **`src/utils/`** - Shared utilities
  - `handler.ts` - Handler promisification
  - `cold-start.ts` - Cold start detection
  - `log.ts` - Logging infrastructure
  - `span-pointers.ts` - Span pointer attributes for managed services

### Configuration Flow

1. Environment variables are read via `getEnvValue()`
2. User-provided config is merged with `defaultConfig`
3. Env vars override defaults if user config not provided
4. Final config passed to both listeners

### Trace Context Propagation

The library extracts trace context from multiple sources (priority order):
1. Custom trace extractor (if configured)
2. Step Functions context (from event payload)
3. Event-specific headers/attributes (HTTP, SQS, SNS, Kinesis, EventBridge, etc.)
4. Lambda authorizer context
5. X-Ray (if merge enabled)

Each extractor in `src/trace/context/extractors/` handles a specific AWS service event format.

### Cold Start Tracing

Controlled by `DD_COLD_START_TRACING` (default: true):
- Uses Node.js diagnostics_channel API to hook into module loading
- Traces require() calls during Lambda initialization
- Respects `DD_MIN_COLD_START_DURATION` (default: 3ms)
- Can skip libraries via `DD_COLD_START_TRACE_SKIP_LIB`

### Extension vs API Submission

The library auto-detects if the Datadog Extension is present:
- **Extension present**: Uses StatsD (UDP) for zero-overhead telemetry
- **No extension**: Direct HTTPS API calls (adds latency but requires no layer)
- **Log forwarding mode**: Writes JSON to stdout for Forwarder Lambda

## Key Environment Variables

See README.md for complete list. Most important:
- `DD_API_KEY` / `DD_KMS_API_KEY` / `DD_API_KEY_SECRET_ARN` - Authentication
- `DD_TRACE_ENABLED` - Enable/disable tracing (default: true)
- `DD_ENHANCED_METRICS` - Enhanced Lambda metrics (default: true)
- `DD_MERGE_XRAY_TRACES` - Merge with X-Ray traces (default: false)
- `DD_CAPTURE_LAMBDA_PAYLOAD` - Capture request/response (default: false)
- `DD_COLD_START_TRACING` - Trace module loading (default: true)
- `DD_FLUSH_TO_LOG` - Use log forwarding (default: false)
- `DD_LOGS_INJECTION` - Inject trace IDs into logs (default: true)

## Testing Strategy

- Unit tests colocated: `*.spec.ts` files alongside source
- Jest configuration in `package.json`
- Integration tests in `integration_tests/` with:
  - Sample event payloads (`input_events/`)
  - Expected output snapshots (`snapshots/`)
- Tests cover all major AWS event source formats

## Dependencies

- **dd-trace**: Datadog APM tracer (peer dependency, must be in Lambda layer)
- **shimmer**: Monkey-patching for HTTP instrumentation
- **@aws-crypto/sha256-js**: Used for Step Functions trace ID hashing
- **promise-retry**: Retries for metrics submission

## Build Output

- Compiled JS: `dist/`
- Type definitions: `dist/**/*.d.ts`
- Source maps: `dist/**/*.js.map`
- Post-build: `scripts/update_dist_version.sh` updates version info

## Layer Structure

When built as a Lambda layer:
```
/opt/nodejs/node_modules/datadog-lambda-js/
  dist/
  package.json
```

The layer also bundles dd-trace and other dependencies.

## Contributing

Use the main branch for development. The library must support Node.js 18.x, 20.x, and 22.x.

When making changes:
1. Update relevant tests
2. Run `yarn test` to verify
3. For significant changes, run integration tests
4. Update snapshots if integration test output changes
