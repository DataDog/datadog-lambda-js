## Purpose

Track what must migrate from `datadog-lambda-js` to `dd-trace-js`.

This is a checklist, not a design document.

## Status Values

| Status | Meaning |
|---|---|
| `pending` | not moved yet |
| `ported` | code moved, tests not complete |
| `verified` | code moved and covered |
| `shim-owned` | intentionally remains in shim |
| `dd-trace-core` | existing dd-trace behavior replaces old code |
| `dropped` | removed with explicit approval |

Release requires no `pending` or `ported` rows.

## Rule

When code moves, move its tests too.

The spike moved much more source than tests. Do not repeat that.

## Entry Points and Shim

| Feature | Owner | Coverage | Status |
|---|---|---|---|
| Layer handler path | shim | golden layer fixture | pending |
| npm handler path | shim | golden npm fixture | pending |
| manual `datadog()` wrapping | shim + dd-trace | golden manual fixture | pending |
| `DD_LAMBDA_HANDLER` resolution | shim | unit + golden | pending |
| CJS handler loading | shim | golden | pending |
| ESM handler loading | shim | golden | pending |
| ESM loader registration | shim | unit + golden | pending |
| `DD_TRACE_EXTRACTOR` loading | shim | unit + golden | pending |
| public shim exports | shim | API surface test | pending |

## Handler Lifecycle

| Feature | Owner | Coverage | Status |
|---|---|---|---|
| promise handler | dd-trace | unit + golden | pending |
| callback handler | dd-trace | unit + golden | pending |
| sync handler | dd-trace | unit + golden | pending |
| callback/promise race | dd-trace | unit | pending |
| `context.done/succeed/fail` | dd-trace | unit | pending |
| thrown error behavior | dd-trace | unit + golden | pending |
| response streaming | dd-trace | e2e/golden if possible | pending |
| timeout behavior | dd-trace | unit + e2e | pending |
| one lifecycle owner | dd-trace | unit | pending |

## Config

Every supported Lambda env var must be wired through dd-trace config or documented as shim-owned.

| Feature | Owner | Coverage | Status |
|---|---|---|---|
| Lambda config defaults | dd-trace | config spec | pending |
| env var parsing | dd-trace | config spec | pending |
| config origins | dd-trace | config spec | pending |
| `DD_TRACE_DISABLED_INSTRUMENTATIONS=lambda` alias | dd-trace | unit | pending |
| log injection reuse | dd-trace-core | config + golden | pending |
| Integration Telemetry readiness | dd-trace | config spec | pending |

## Context Extractors

| Extractor | Coverage | Status |
|---|---|---|
| custom extractor, awaited | unit + golden | pending |
| API Gateway / HTTP | unit + golden | pending |
| ALB | unit + golden | pending |
| SQS | unit + golden | pending |
| SNS | unit + golden | pending |
| SNS through SQS | unit + golden | pending |
| EventBridge | unit + golden | pending |
| EventBridge through SQS | unit + golden | pending |
| Kinesis | unit + golden | pending |
| DynamoDB | unit + golden | pending |
| S3 | unit + golden | pending |
| AppSync | unit + golden | pending |
| Step Functions | unit + golden | pending |
| Durable Execution | unit + e2e | pending |
| Lambda context/client context | unit + golden | pending |
| X-Ray fallback | unit + golden | pending |

## Inferred Spans

| Feature | Coverage | Status |
|---|---|---|
| API Gateway inferred span | golden | pending |
| ALB inferred span | golden | pending |
| SQS inferred span | golden | pending |
| SNS inferred span | golden | pending |
| EventBridge inferred span | golden | pending |
| Kinesis inferred span | golden | pending |
| DynamoDB inferred span | golden | pending |
| S3 inferred span | golden | pending |
| AppSync inferred span | golden | pending |
| Step Functions inferred span | golden | pending |
| service/resource/name parity | mock-agent + golden | pending |
| parent/child ordering | mock-agent + order-sensitive check | pending |

## Lambda Span Tags

| Tag / Behavior | Coverage | Status |
|---|---|---|
| `aws.lambda` name/resource/service | mock-agent + golden | pending |
| `serverless` type | mock-agent | pending |
| `span.kind` | golden | pending |
| `cold_start` | golden | pending |
| `function_arn` | golden | pending |
| `function_version` | golden | pending |
| `request_id` | golden | pending |
| `resource_names` | golden | pending |
| `functionname` | golden | pending |
| `datadog_lambda` | golden | pending |
| `dd_trace` | golden | pending |
| `_dd.origin` | golden | pending |
| `_dd.parent_source` | fixture/e2e | pending |
| `proactive_initialization` | e2e | pending |
| HTTP 5xx error behavior | golden | pending |
| payload capture | unit + golden | pending |

## Span Pointers

| Feature | Coverage | Status |
|---|---|---|
| S3 ObjectCreated filtering | unit + golden | pending |
| DynamoDB INSERT/MODIFY/REMOVE filtering | unit + golden | pending |
| shared pointer hash utility | unit | pending |
| shared primary-key extraction | unit | pending |
| span-pointer API use | mock-agent | pending |
| real AWS pointer parity | e2e | pending |

## Metrics

| Feature | Coverage | Status |
|---|---|---|
| enhanced invocation metric | golden | pending |
| enhanced error metric | golden | pending |
| batch item failure metric | golden | pending |
| extension UDP sink | unit/e2e | pending |
| `DD_FLUSH_TO_LOG` sink | golden | pending |
| direct API sink | unit | pending |
| API key plaintext | unit | pending |
| KMS API key | unit | pending |
| Secrets Manager API key | unit | pending |
| FIPS endpoint behavior | unit | pending |
| `DD_LOCAL_TESTING` | unit + golden | pending |
| custom metric API | unit + golden | pending |
| one queue and one flush barrier | unit | pending |
| awaited flush before completion | unit | pending |
| `time_to_first_byte` | e2e | pending |

## AppSec, DSM, Cold Start

| Feature | Coverage | Status |
|---|---|---|
| AppSec start invocation | unit | pending |
| AppSec end invocation | unit | pending |
| AppSec e2e usage | e2e | pending |
| DSM consume checkpoints | unit | pending |
| cold-start tracing spans | unit + golden | pending |
| cold-start skip library | unit | pending |
| min cold-start duration | unit | pending |

## Release and Packaging

| Feature | Coverage | Status |
|---|---|---|
| layer layout unchanged | golden layer fixture | pending |
| layer names unchanged | release check | pending |
| GovCloud publishing unchanged | release pipeline | pending |
| signing unchanged | release pipeline | pending |
| docs automation unchanged | release pipeline | pending |
| size gate unchanged | release pipeline | pending |
| prune list preserves required features | release check | pending |
| shim version maps to layer version | release check | pending |
| `datadog_lambda` tag uses shim version | golden | pending |
| npm dependency range tested | install test | pending |
| Node 18/20 freeze documented | docs | pending |