# Migration Parity

## Columns

| Column | Meaning |
|---|---|
| **Owner (code location)** | Where the code lives after migration: `dd:…` = dd-trace-js path, `shim:…` = datadog-lambda-js path, `dd-core:…` = pre-existing dd-trace module reused as-is |
| **Test type/location** | Level 1 unit/mock-agent (repo: dir) · Level 2 RIE/docker golden (`integration_tests_local`, per runtime × mode) · Level 3 real AWS (`serverless-e2e-tests/<suite>`) · `release` = GitLab release pipeline check |
| **Test implementation** | The concrete artifact: existing spec to port (`dl:src/…​.spec.ts` → `dd:packages/datadog-plugin-lambda/test/…​.spec.js`), golden fixture name, e2e suite row, or `— new` if it must be written |
| **Migration status** | `pending` → `ported` (code moved, tests incomplete) → `verified` (covered). Also `shim-owned` / `dd-core` / `dropped (reason, sign-off)` |
| **Effect in layer** | Which package's code produces this behavior when a customer runs the post-migration layer: `dd-trace` · `datadog-lambda-js` · `both` |

Release requires zero `pending`/`ported` rows. A row with `— new` under test implementation and
no L3 suite is an **unprotected feature** — flag it, don't tolerate it.


## Runtimes and release lines

Four runtimes ship. Two tracer majors ship. A row is not `verified` until it is verified on the
oldest runtime it claims to support.

| Runtime | Layer | Tracer line | `engines.node` | Released until |
|---|---|---|---|---|
| Node 18 | `Datadog-Node18-x` | `dd-trace` v5.x | `>=18` | March 3, 2027 (AWS block-update date) |
| Node 20 | `Datadog-Node20-x` | `dd-trace` v5.x | `>=18` | March 3, 2027 (AWS block-update date) |
| Node 22 | `Datadog-Node22-x` | `dd-trace` v6.x | `>=22` | current |
| Node 24 | `Datadog-Node24-x` | `dd-trace` v6.x | `>=22` | current |

`v6.x` is `>=22` and does nothing for Node 18/20 — `v5.x` is the only line that runs there.
`v5.x` EOL is 2027-07-02, four months after the AWS date. If that date moves past July 2027,
escalate: v5 EOL becomes the binding constraint.

Dates verified against the AWS Lambda runtimes page: `nodejs18.x` deprecated 2025-09-01,
`nodejs20.x` deprecated 2026-04-30, both with block-create 2027-02-01 and block-update
2027-03-03. Both runtimes are *deprecated already* — AWS applies OS patches only, not language
runtime patches. "Released until 2027-03-03" means we keep shipping through the update window;
it is not a claim that the runtimes are fully supported by AWS.

Backport feasibility is verified, not assumed: plugin-facing infra files are byte-identical
between `v5.x` and `master` today; every API the plugin needs exists on `v5.x`; v5.x CI runs
Node 18/20/22 legs. The one per-line exception is `packages/dd-trace/src/config/index.js`.

## Backport and release-line gates

Each row gates the release independently of the feature rows below.

| Item | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| Plugin registered on `v6.x` | dd:`packages/dd-trace/src/plugins/index.js` (branch `v6.x`) | L1 (dd-trace-js CI, all Node legs) | `plugin-structure.spec.js` on v6.x | pending | — (process) |
| Plugin registered on `v5.x` — same assertions exist there | dd:`…/plugins/index.js` (branch `v5.x`) | L1 (dd-trace-js CI, all Node legs) | `plugin-structure.spec.js` on v5.x | pending | — (process) |
| Facade surface identical on `master` / `v6.x` / `v5.x` | dd:`lambda.js` | L1 (dd-trace-js) | facade API-surface test on packed tarball × 3 lines — new | pending | dd-trace |
| Public types in `index.d.ts` | dd:`index.d.ts` | L1 (dd-trace-js) | type test | pending | — (process) |
| Public types in `index.d.v5.ts` | dd:`index.d.v5.ts` | L1 (dd-trace-js, v5.x branch) | type test on v5.x | pending | — (process) |
| No post-Node-18 syntax on the plugin path | dd:`packages/datadog-plugin-lambda/**` | L1 (dd-trace-js lint) | lint rule pinned to Node 18 target — new | pending | dd-trace |
| Config wiring applied per-line (`config/index.js` is not cherry-pick-clean) | dd:`packages/dd-trace/src/config/index.js` × 2 lines | L1 (dd-trace-js) | config spec on both lines | pending | dd-trace |
| npm range resolves to v5 on Node 18 | shim:`package.json` | L1 (datadog-lambda-js) | install test on Node 18 — new | pending | both |
| npm range floor bumped to latest v5.x at shim release (check registry, not local tags) | shim:`package.json` | release | release checklist item — new | pending | both |
| Shim declares `engines.node >=18` | shim:`package.json` | L1 (datadog-lambda-js) | package check — new | pending | datadog-lambda-js |
| Node 18/20 layers built and published | shim:`scripts/build_layers.sh`, `scripts/move_ddtrace_dependency.js` | release | per-runtime dd-trace pin threaded from `NODE_VERSIONS` loop + test | pending | both |
| Per-runtime dd-trace pin stamped into the release | shim:release scripts | release | release notes mapping check — new | pending | both |

## Entry points and shim

Why the shim owns these: ordering and module resolution must happen before/around dd-trace init,
and the async ESM loader cannot live in dd-trace production code (dd-trace `AGENTS.md`:
no promises/`async` in npm production code). Everything else migrates.

| Feature | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| Layer handler path `/opt/nodejs/node_modules/datadog-lambda-js/handler.handler` | shim:`src/handler.mjs` (+ Dockerfile layout) | L2 layer fixture ×4 runtimes; L3 `handler-types` | golden layer variants | pending | datadog-lambda-js |
| npm handler path `node_modules/datadog-lambda-js/dist/handler.handler` | shim:`src/handler.mjs` + `scripts/update_dist_version.sh` | L2 npm fixture | golden npm variants | pending | datadog-lambda-js |
| Manual `datadog(handler, config?)` wrapping | shim:`src/index.ts` export → dd:`lambda.js` `wrap` | L2 manual fixture | golden manual variants | pending | both |
| `DD_LAMBDA_HANDLER` resolution (nested dirs, extensions, `type:module`) | shim:`src/runtime/user-function.ts` | L1 + L2 | `dl:src/utils/handler.spec.ts` + `user-function` cases → port | pending | datadog-lambda-js |
| CJS handler loading | shim:`src/runtime/user-function.ts` | L2 | golden cjs variants | pending | datadog-lambda-js |
| ESM handler loading (`.mjs`, TLA) | shim:`src/runtime/user-function.ts` | L2 + L3 | golden esm variants; `ERR_REQUIRE_ESM` guard from `integration_tests/serverless.yml:111` → port | pending | datadog-lambda-js |
| ESM loader registration + double-registration guard | shim:`src/handler.mjs` (`Module.register`) | L1 + L2 | — new (guard unit test) + golden esm | pending | datadog-lambda-js |
| `DD_TRACE_EXTRACTOR` module loading | shim:`src/handler.mjs` | L1 + L2 | — new + golden custom-extractor fixture | pending | datadog-lambda-js |
| Public shim exports (`datadog`, `sendDistributionMetric{,WithDate}`, `getTraceHeaders`, `TraceHeaders`, env-var constants, `setLogger`/`setLogLevel`) | shim:`src/index.ts` → delegates to dd:`lambda.js` | L1 (datadog-lambda-js) | API-surface test against packed tarball — new | pending | both |
| Handler-load failure telemetry (`emitTelemetryOnErrorOutsideHandler`) | shim:`src/runtime/errors.ts` | L1 | `dl:` failure-path cases — port/rewrite | pending | datadog-lambda-js |
| `DD_TRACE_DISABLED_PLUGINS="fs"` default | dd:`packages/datadog-plugin-lambda/src/defaults` (moves out of shim) | L1 + L2 | config spec + golden | pending | dd-trace |
| Exactly one wrapper when layer + `NODE_OPTIONS` both active | dd:`lambda.js` `wrap` (`Symbol.for('dd-trace.lambda.wrapped')` guard) | L1 | — new (double-entry test) | pending | dd-trace |
| Early tracer-init ordering (init before handler load) | shim:`src/handler.mjs` | L2 | golden (cold-start fields present) | pending | datadog-lambda-js |

## Handler lifecycle

| Feature | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| promise handler | dd:`lambda.js` `wrap` → instrumentation channel | L1 + L2 | `dl:src/utils/handler.spec.ts` → port + golden | pending | dd-trace |
| callback handler (no early completion) | dd:`packages/datadog-plugin-lambda/src/handler-utils.js` (`promisifiedHandler`) | L1 + L2 | `dl:src/utils/handler.spec.ts` → port + golden; first test pins the `tracePromise` non-thenable behavior empirically | pending | dd-trace |
| sync handler | dd:`lambda.js` `wrap` path | L1 + L2 | same spec + golden | pending | dd-trace |
| callback/promise race (first wins) | dd:`handler-utils.js` | L1 | `dl:src/utils/handler.spec.ts` race cases → port | pending | dd-trace |
| `context.done/succeed/fail` | dd:`handler-utils.js` | L1 | same spec → port | pending | dd-trace |
| `callbackWaitsForEmptyEventLoop` semantics | dd:`handler-utils.js` | L1 | same spec → port | pending | dd-trace |
| thrown error → span error + rethrow | dd:`packages/datadog-plugin-lambda/src/index.js` | L1 + L2 | `dl:src/index.spec.ts` error cases → port + golden error fixtures | pending | dd-trace |
| response streaming (+ streaming symbol preserved) | dd:`packages/datadog-instrumentations/src/lambda.js` + shim loader | L3 `serverless-e2e-tests/lambda-features` (+ L2 if RIE supports it — verify at lifecycle phase) | e2e cases — new/assigned | pending | both |
| `time_to_first_byte` | dd:`packages/datadog-plugin-lambda/src/enhanced-metrics.js` | L3 | e2e — new | pending | dd-trace |
| timeout behavior (impending-timeout error, `killAll`, flush deadline) | dd:plugin owns timer; `dd:packages/dd-trace/src/lambda/*` folds in | L1 + L3 | `dl:` timeout cases + existing `dd:test/lambda/*.spec.js` → migrate | pending | dd-trace |
| one lifecycle owner (no double wrap, no double timer) | dd:`packages/dd-trace/src/plugin_manager.js` + plugin | L1 | — new (exactly-one-span test) | pending | dd-trace |
| cold-start `initTime` captured at preload, not plugin module load | dd:plugin init path | L1 | — new | pending | dd-trace |

## Config

Every supported Lambda env var must be wired through dd-trace config (7-step: defaults →
`#applyEnvironment()` → types → telemetry mapping → `supported-configurations.json` → docs →
config spec) or documented as shim-owned. A documented variable that is not wired is a bug.

| Feature | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| Lambda config defaults (no hardcoded `configure()` literals) | dd:`packages/dd-trace/src/config/defaults.js` | L1 | `dd:test/config/index.spec.js` cases | pending | dd-trace |
| Env var parsing (`DD_ENHANCED_METRICS`, `DD_CAPTURE_LAMBDA_PAYLOAD`(+depth), `DD_TRACE_MANAGED_SERVICES`, `DD_MERGE_XRAY_TRACES`, `DD_ENCODE/DECODE_AUTHORIZER_CONTEXT`, `DD_COLD_START_TRACING`, `DD_MIN_COLD_START_DURATION`, `DD_COLD_START_TRACE_SKIP_LIB`, `DD_TRACE_AWS_ADD_SPAN_POINTERS`, `DD_APM_FLUSH_DEADLINE_MILLISECONDS`) | dd:`packages/dd-trace/src/config/index.js` | L1 | config spec, default/set/invalid per var | pending | dd-trace |
| Metrics/env: `DD_FLUSH_TO_LOG`, `DD_LOCAL_TESTING`, `DD_API_KEY`, `DD_KMS_API_KEY`, `DD_API_KEY_SECRET_ARN`, `DD_SITE`, FIPS/GovCloud endpoints | dd:`config/index.js` + metrics modules | L1 | config spec + `dl:src/metrics/*.spec.ts` cases → port | pending | dd-trace |
| `DD_LOGS_INJECTION` — reuse existing `logInjection` (no parallel `lambda.injectLogContext`) | dd-core:`config/index.js` | L1 + L2 | config spec + golden | pending | dd-trace |
| `DD_LOG_LEVEL` / logger | shim:`src/utils/log.ts` → dd log | L1 | `dl:src/utils/log.spec.ts` → port | pending | both |
| `DD_DATA_STREAMS_ENABLED` | dd-core: existing DSM config | L1 | config spec | pending | dd-trace |
| `DD_LAMBDA_HANDLER`, `DD_TRACE_EXTRACTOR` | shim-owned (loader) | L2 | golden fixtures | pending | datadog-lambda-js |
| `DD_TRACE_DISABLED_INSTRUMENTATIONS=lambda` alias survives `aws-lambda` rename | dd:`packages/dd-trace/src/lambda/index.js:19` + plugin | L1 | — new (no fixture sets it) | pending | dd-trace |
| Config origins tracked (Integration Telemetry readiness) | dd:`config/index.js` | L1 | config spec (origin assertions) | pending | dd-trace |

## Context extractors

Chain order is behavior (contract C10): custom (awaited) → durable-execution → HTTP → SNS →
SNS-SQS → EventBridge-SQS → AppSync → SQS → Kinesis → EventBridge → lambda context → X-Ray
fallback (unconditional; sampling-priority gated on `mergeXrayTraces` — documented improvement).

| Extractor | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| custom extractor, **awaited** | dd:`…/src/extractors/custom.js` | L1 + L2 | `dl:src/trace/context/extractors/custom.spec.ts` → port; async case required | pending | dd-trace |
| durable execution (checked **first**) | dd:`…/src/extractors/durable-execution.js` | L1 + L3 `durable-functions` | `dl:…/durable-execution.spec.ts` → port + e2e | pending | dd-trace |
| API Gateway / HTTP / ALB / Lambda URL (`headers`/`multiValueHeaders`) | dd:`…/src/extractors/http.js` | L1 + L2 + L3 `trace-propagation` | `dl:…/http.spec.ts` → port + golden `api-gateway-*` fixtures | pending | dd-trace |
| SNS | dd:`…/src/extractors/sns.js` | L1 + L2 | `dl:…/sns.spec.ts` → port + golden `sns.json` | pending | dd-trace |
| SNS through SQS (envelope unwrap; spike mis-routed this) | dd:`…/src/extractors/sns-sqs.js` | L1 + L2 | `dl:…/sns-sqs.spec.ts` → port + golden fixture | pending | dd-trace |
| EventBridge through SQS (same defect class) | dd:`…/src/extractors/event-bridge-sqs.js` | L1 + L2 | `dl:…/event-bridge-sqs.spec.ts` → port + golden fixture | pending | dd-trace |
| AppSync | dd:`…/src/extractors/app-sync.js` | L1 + L2 | `dl:…/app-sync.spec.ts` → port + fixture | pending | dd-trace |
| SQS | dd:`…/src/extractors/sqs.js` | L1 + L2 + L3 | `dl:…/sqs.spec.ts` → port + golden `sqs.json` | pending | dd-trace |
| Kinesis | dd:`…/src/extractors/kinesis.js` | L1 + L2 | `dl:…/kinesis.spec.ts` → port | pending | dd-trace |
| EventBridge | dd:`…/src/extractors/event-bridge.js` | L1 + L2 | `dl:…/event-bridge.spec.ts` → port | pending | dd-trace |
| Step Functions (incl. X-Ray metadata branch) | dd:`…/src/extractors/step-function.js` + `step-function-service.js` | L1 + L2 | `dl:…/step-function.spec.ts` + `dl:src/trace/step-function-service.spec.ts` → port | pending | dd-trace |
| Lambda context (`clientContext.custom`) | dd:`…/src/extractors/lambda-context.js` | L1 + L2 | `dl:…/lambda-context.spec.ts` → port | pending | dd-trace |
| X-Ray fallback + `mergeXrayTraces` gating | dd:`…/src/xray-service.js` | L1 + L2 | `dl:src/trace/xray-service.spec.ts` → port; both merge modes tested | pending | dd-trace |
| extraction chain order + `addTraceContextToXray` | dd:`…/src/trace-context-extractor.js` | L1 | `dl:src/trace/context/extractor.spec.ts`, `extractor-utils.spec.ts` → port | pending | dd-trace |

## Inferred spans and trigger tags

| Feature | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| Inferred spans: API GW REST/HTTP/WS, ALB, SQS, SNS, SNS-SQS, EventBridge, EB-SQS, Kinesis, DynamoDB, S3, AppSync, Step Functions, durable | dd:`…/src/span-inferrer.js` | L1 + L2 | `dl:src/trace/span-inferrer.spec.ts` → port + golden per-event fixtures | pending | dd-trace |
| service/resource/name parity (incl. `DD_SERVICE_MAPPING` via config, not env) | dd:`…/src/span-inferrer.js` | L1 (mock-agent) + L2 | — new mock-agent cases + golden | pending | dd-trace |
| parent/child ordering (inferred span finished before `aws.lambda`) | dd:plugin lifecycle | L1 + order-sensitive diff | — new unsorted subset check (both harnesses) | pending | dd-trace |
| authorizer context encode (response) / decode (request), one shared impl | dd:`…/src/span-inferrer.js` + `extractors/http.js` | L1 + L2 | `dl:` authorizer cases → port + golden | pending | dd-trace |
| trigger tags + HTTP status-code tag | dd:`…/src/trigger.js` | L1 + L2 | `dl:src/trace/trigger.spec.ts` → port + golden | pending | dd-trace |
| event type guards + validator | dd:`…/src/event-type-guards.js` | L1 | `dl:src/utils/event-type-guards.ts` cases + `dl:src/trace/trigger.spec.ts` → port | pending | dd-trace |
| X-Ray trigger-tag subsegments | dd:`…/src/xray-service.js` | L1 | `dl:src/trace/xray-service.spec.ts` cases → port | pending | dd-trace |

## Lambda span tags

| Tag / behavior | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| `aws.lambda` name / resource / service, `serverless` type | dd:`…/src/index.js` | L1 (mock-agent) + L2 | — new `test/index.spec.js` + golden | pending | dd-trace |
| `span.kind`, `cold_start`, `function_arn`, `function_version`, `request_id`, `resource_names`, `functionname`, `datadog_lambda`, `dd_trace`, `_dd.origin` | dd:`…/src/index.js` | L2 golden (all present in current snapshots — the gate catches their absence) | golden; mock-agent asserts in `test/index.spec.js` | pending | dd-trace |
| `_dd.parent_source` | dd:`…/src/index.js` | L2 or L3 | — new fixture, else e2e-assigned | pending | dd-trace |
| `proactive_initialization` | dd:`…/src/cold-start.js` | L3 only (RIE cannot produce it; normalization drops markers) | e2e — assigned to `lambda-features` | pending | dd-trace |
| HTTP 5xx → span error + enhanced error metric | dd:`…/src/index.js` + `enhanced-metrics.js` | L1 + L2 | golden 500 fixture + unit | pending | dd-trace |
| payload capture + depth cap | dd:`…/src/handler-utils.js` (`tagObject`) | L1 + L2 | `dl:src/utils/tag-object.spec.ts` → port + golden toggle fixture | pending | dd-trace |
| log injection (trace ids in console output) | dd:`…/src/console-patcher.js` | L1 + L2 | `dl:src/trace/patch-console.spec.ts` → port + golden | pending | dd-trace |

## Span pointers

| Feature | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| S3 `ObjectCreated*` filtering | dd:`…/src/span-pointers.js` | L1 + L2 | `dl:src/utils/span-pointers.spec.ts` → port (incl. ObjectRemoved negative case) | pending | dd-trace |
| DynamoDB `INSERT\|MODIFY\|REMOVE` filtering | dd:`…/src/span-pointers.js` | L1 + L2 | same spec → port | pending | dd-trace |
| shared `generatePointerHash` / `extractPrimaryKeys` (no second hash impl; spike's `k=v` hash provably mismatches) | dd-core:`packages/datadog-plugin-aws-sdk/src/util.js` | L1 | — new: producer/consumer equality unit test (same repo → same process) | pending | dd-trace |
| span-pointer API (`addSpanPointer`), not `span.addLink` | dd:`…/src/index.js` call site | L1 (mock-agent) | — new | pending | dd-trace |
| real AWS pointer parity | dd:`…/src/span-pointers.js` | L3 `serverless-e2e-tests/span-pointers` | FEATURE-PARITY.md rows | pending | dd-trace |

## Metrics

One queue, one awaited flush barrier before invocation end (contract C16). No sink is
conditional on the extension being present.

| Feature | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| enhanced metrics: invocations / errors / batch_item_failures (+ tag set) | dd:`…/src/enhanced-metrics.js` | L1 + L2 | `dl:src/metrics/enhanced-metrics.spec.ts` → port + golden (9 metric-log records per baseline log) | pending | dd-trace |
| sink: extension DogStatsD UDP 8125 | dd-core:`packages/dd-trace/src/dogstatsd.js` (extend, no private client) | L1 + L3 | `dl:src/metrics/dogstatsd.spec.ts` → port + fake-socket unit | pending | dd-trace |
| sink: `DD_FLUSH_TO_LOG` metric-log JSON | dd:metrics modules | L2 golden | `dl:src/metrics/metric-log.spec.ts` → port + golden | pending | dd-trace |
| sink: direct API | dd:metrics modules | L1 | `dl:src/metrics/{api,processor,queue,batcher,model}.spec.ts` → port | pending | dd-trace |
| key resolution: plaintext / KMS / Secrets Manager | dd:metrics modules | L1 | `dl:src/metrics/kms-service.spec.ts` → port | pending | dd-trace |
| FIPS endpoint behavior | dd:`…/src/fips.js` + metrics | L1 | `dl:src/utils/fips.spec.ts` → port | pending | dd-trace |
| `DD_LOCAL_TESTING` | dd:metrics modules | L1 + L2 | `dl:src/metrics/extension.spec.ts` cases → port + golden | pending | dd-trace |
| `sendDistributionMetric` / `sendDistributionMetricWithDate` | shim exports → dd:`lambda.js` facade impl | L1 + L2 | `dl:src/index.spec.ts` metric cases → port + custom-metric golden fixture | pending | both |
| one queue shared by enhanced + custom metrics; awaited flush | dd:metrics modules | L1 | — new | pending | dd-trace |
| `time_to_first_byte` (streaming) | dd:`…/src/enhanced-metrics.js` | L3 | e2e — new | pending | dd-trace |
| `datadog_lambda:vX.Y.Z` = shim/layer version | shim version → dd:metrics tag | L2 golden (normalized) | golden + release mapping check | pending | both |

## AppSec, DSM, cold start

| Feature | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| AppSec start/end invocation publishing | dd:`…/src/appsec.js` | L1 (mock-agent) | `dl:src/appsec/{index,event-data-extractor}.spec.ts` → port | pending | dd-trace |
| AppSec e2e usage | dd:`…/src/appsec.js` | L3 `lambda-features` | FEATURE-PARITY.md "Appsec Usage" row | pending | dd-trace |
| DSM consume checkpoints (SQS/SNS/Kinesis/EventBridge) | dd:extractors + dd-core checkpointer | L1 (+ L3) | — new (`setConsumeCheckpoint` assertions) | pending | dd-trace |
| cold-start capture (module-load tree, `dd-trace:moduleLoadStart/End`) — **fully dd-trace-owned**; subscribe during dd-trace init, before RITM publishes | dd:`…/src/cold-start.js` (+ init path) | L1 | `dl:src/runtime/require-tracer.spec.ts` → port; **non-empty-tree test** (publication is `hasSubscribers`-gated — late subscription is silently empty) | pending | dd-trace |
| cold-start span conversion (`aws.lambda.require`), skip-lib, min-duration | dd:`…/src/cold-start-tracer.js` | L1 + L2 | `dl:src/trace/cold-start-tracer.spec.ts`, `dl:src/utils/cold-start.spec.ts` → port | pending | dd-trace |
| managed-instances skip | dd:`…/src/cold-start.js` | L1 | — new | pending | dd-trace |

## Deliberately not ported (replaced by dd-trace core)

| Feature | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| HTTP header injection (`patch-http.ts`) | dd-core: dd-trace http/https plugins | L2 | golden (downstream headers visible in fixtures) | dd-core | dd-trace |
| tracer wrapper / span wrapper plumbing | dd-core: dd-trace tracer API | — | covered transitively by plugin tests | dd-core | dd-trace |

## Release and packaging

| Feature | Owner (code location) | Test type/location | Test implementation | Migration status | Effect in layer |
|---|---|---|---|---|---|
| layer layout `/opt/nodejs/node_modules/…` unchanged | shim:`Dockerfile` | L2 layer fixture + release | golden layer variants | pending | both |
| layer names, GovCloud, signing, docs automation unchanged | shim:`scripts/publish_*.sh`, `create_documentation_pr.sh` | release | pipeline dry-run | pending | both |
| size gate 9 MB / 24 MB unchanged | shim:`scripts/check_layer_size.sh` | release | existing gate | pending | both |
| prune list extended for v5/v6 native footprint; **each prune entry maps to a feature row** (profiling, AppSec natives — `--omit=optional` is not available) | shim:`Dockerfile` | release + L3 (Profiling/Appsec Usage rows) | — new mapping review | pending | dd-trace |
| per-runtime dd-trace resolution (v5.x for 18/20, v6.x for 22/24) | shim:`scripts/move_ddtrace_dependency.js` + `build_layers.sh` | release | — new: takes a list, threaded from `NODE_VERSIONS`, plus test | pending | both |
| shim version ↔ layer version mapping (`13.N.0` ↔ layer N) | shim:`package.json` | release | release check | pending | datadog-lambda-js |
| Node 18/20/22/24 layers all build and publish post-migration | shim:release pipeline | release | pipeline | pending | both |
| test-only layer assembler in dd-trace-js (never publishes/signs/prunes) | dd:`integration-tests/lambda/build-test-layer.sh` — new | L2 | per-PR CI; fails if run with release credentials | pending | — (process) |
| e2e release gate triggered with candidate layer version (today: manual form) | `serverless-e2e-tests` `.gitlab-ci.yml` | release | — new pipeline trigger | pending | — (process) |
| old business logic deleted from `datadog-lambda-js/src/` | shim:`src/` | — | last step; all rows `verified` first | pending | — (process) |

## Unprotected features (must reach zero before release)

| Row | Feature | Why unprotected | Plan |
|---|---|---|---|
| Handler lifecycle | `time_to_first_byte`, response streaming | RIE may not support streaming invocations | L3 `lambda-features`; re-check RIE support at lifecycle phase |
| Span tags | `proactive_initialization` | RIE cannot produce a proactively-initialized sandbox; normalization drops its markers | L3 `lambda-features` |
| Span tags | `_dd.parent_source` | absent from current goldens | add fixture from old implementation, else L3 |
| Config | `DD_TRACE_DISABLED_INSTRUMENTATIONS=lambda` alias | no fixture sets it | unit test |
| Shim | ESM double-registration guard, init-error telemetry | no fixture | unit tests |
| Metrics | direct-API + KMS/Secrets paths | no local AWS; unit only | unit + L3 spot-check |
