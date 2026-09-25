# Local integration tests (docker + AWS RIE, no AWS account required)

This directory contains a **local** integration test harness for
datadog-lambda-js. It runs container-image, layer-mode, and
manual-wrap handlers, plus targeted feature cases (HTTP header injection,
custom trace extractors, proactive initialization) — inside Docker against the
[AWS Lambda Runtime Interface Emulator (RIE)](https://github.com/aws/aws-lambda-runtime-interface-emulator),
invokes them with the same input events as the deprecated real AWS Lambda
resource-based suite, captures logs from `docker logs`, normalizes them with
the `rie` mode of
`../scripts/normalize_integration_logs.sh`, and diffs them against **local**
snapshots in `./snapshots/`.

The case set is deliberately at least as wide as the deprecated real AWS
Lambda resource-based suite (`integration_tests/serverless.yml`): every
behavior it pinned has a docker-based counterpart here, so the frozen goldens
are a strict superset oracle for the dd-trace-js migration.

Nothing here touches AWS, and nothing here touches
`integration_tests/snapshots/` (the AWS suite's snapshots).

## Prerequisites

- Docker (tested with colima on macOS arm64)
- `node`, `yarn`, `perl`, `sed`, `curl` (all already used by the AWS suite)
- Network access for the first run (pulls `public.ecr.aws/lambda/nodejs:*`
  base images, ~1 GB each, and downloads the pinned RIE binary into `./bin/`)

## Running

```bash
# Everything: nodejs 18/20/22/24/26 x all cases
./integration_tests_local/run.sh

# One runtime / one case
RUNTIME_PARAM=18 CASE_PARAM=layer-cjs ./integration_tests_local/run.sh

# (Re)generate local snapshots
UPDATE_SNAPSHOTS=true RUNTIME_PARAM=22 CASE_PARAM=container-cjs ./integration_tests_local/run.sh

# Skip repacking the library (reuse container/*/datadog-lambda-js-local.tgz)
SKIP_PACK=true RUNTIME_PARAM=18 CASE_PARAM=container-esm ./integration_tests_local/run.sh

# Force amd64 images instead of arm64
PLATFORM=linux/amd64 ./integration_tests_local/run.sh

# Bypass a broken local VM host-port forward without changing the function.
# Runs the same HTTP requests using curl inside the target container.
RIE_HTTP_TRANSPORT=container RUNTIME_PARAM=22 CASE_PARAM=manual-timeout ./integration_tests_local/run.sh
```

CI runs the complete runtime/case matrix on native `linux/amd64` and
`linux/arm64` GitHub-hosted runners. Both architectures share the same
snapshots: the normalizer removes platform-owned preview/deprecation records
as complete structured records before formatting them.

The npm tarball does not bundle `dd-trace`, so a full sweep packs it once with
the tracer line supported by the contributor's host. Every fixture image,
including the layer fixture, then installs the tracer version for its Lambda
runtime: the maintained v5 compatibility pin on Node 18/20 and the exact v6
version resolved by the root `yarn.lock` on Node 22+. Consequently the normal
dependency-update workflow also updates the RIE fixtures without a separate v6
pin. CI additionally sets the host Node version to its matrix runtime.

The case names are:

| Case | What it covers |
|---|---|
| `container-cjs` / `container-esm` | npm-redirect container handlers (CJS / ESM entry), the default onboarding path |
| `layer-cjs` / `layer-esm` | layer-mode handlers loaded from `/opt/nodejs/node_modules/datadog-lambda-js` (CJS / ESM entry) |
| `manual-throw-error` | manual `datadog(handler)` wrap of a throwing handler; error body + enhanced error metrics |
| `manual-status-500` | manual wrap with userland `dd-trace` init returning a 500 API Gateway response (`DD_TRACE_ENABLED=true`); error span tag + enhanced error metrics |
| `manual-send-metrics` | manual wrap calling `sendDistributionMetric` inside and outside the handler; per-event return values |
| `manual-process-input` | manual wrap with userland `dd-trace` init reading the active span; per-event return values |
| `manual-callback` | manual wrap of a callback-style `(event, context, callback)` handler; pins the `promisifiedHandler` seam end to end (the migration spike broke exactly this) |
| `manual-timeout` | explicit userland tracer init, then manual wrap; impending-timeout error on the invocation and `killAll()` flushing an unfinished child before RIE terminates the runtime |
| `cjs-timeout` | the same timeout contract through `DD_LAMBDA_HANDLER` and the npm redirect entrypoint, exercising the raw-handler hook also used by layers |
| `manual-metrics-only` | `DD_TRACE_ENABLED=false` (metrics-only customers): enhanced + custom metrics still flush, no `aws.lambda` span, no trace JSON, no `dd.trace_id` log correlation |
| `cjs-capture-payload` | `DD_CAPTURE_LAMBDA_PAYLOAD=true` in redirect mode; span meta gains `function.request` / `function.response` with the captured payloads |
| `cjs-http-requests` | downstream HTTP calls against a hermetic mock server in redirect mode; asserts injected `x-datadog-*`/`traceparent` headers and log injection via dd-trace's http plugin |
| `manual-http-requests` | same handler, manual wrap without userland dd-trace init; exercises the library's own `patchHttp` fallback (request wrapping + per-request logging + exact header set via mock echo) |
| `cjs-fetch-requests` | fetch variant of `cjs-http-requests`: the global fetch (undici) is instrumented by a different dd-trace plugin than http/https; mock echo pins the injected headers on that path |
| `cjs-custom-extractor` | `DD_TRACE_EXTRACTOR=extractor.extract`; asserts `_dd.parent_source: event` on the inferred span |
| `cjs-proactive-init` | eager-init managed-instances RIE path with a 15 s init→invoke gap; asserts proactive-initialization markers on the raw logs |

Two legacy aliases remain for muscle memory: `VARIANT_PARAM=cjs|esm` maps to
`container-cjs`/`container-esm`, and `SIMULATE_PROACTIVE_INIT=true` maps to
`CASE_PARAM=cjs-proactive-init`.

Unless `SKIP_PACK=true` is set, each run repacks the library under test
(`yarn install --frozen-lockfile && yarn build && npm pack`) into
`integration_tests/container/{cjs,esm}/datadog-lambda-js-local.tgz`, exactly
like the deprecated real AWS Lambda resource-based suite
(`scripts/run_integration_tests.sh`) did, so the containers always test the
working tree. The layer fixture instead assembles
`integration_tests/container/layer/layer_pkg/` from the repo build via
`prepare-layer.js`, mirroring the release Dockerfile's layer layout. The
dependency manifest mirrors the release build's full dependency closure —
production dependencies plus every package `scripts/move_ddtrace_dependency.js`
moves (dd-trace, @datadog/native-appsec, @datadog/pprof, @opentelemetry/api,
@opentelemetry/api-logs) — with versions pinned from the lockfile-resolved
`node_modules` set.

The harness takes no flags or positional arguments — configuration is
environment-only, and an unexpected argument is rejected rather than ignored.

Without `UPDATE_SNAPSHOTS=true`, every expected return-value and log snapshot
must already exist. A missing snapshot fails the run and is never created
implicitly. Update mode is the only path that creates or overwrites snapshots.

## Snapshot layout: shared goldens with per-case overrides

Each case has one shared log golden and, depending on its return mode, one
shared return-value golden:

```
snapshots/logs/<case>.log                    # shared across runtimes
snapshots/return_values/default.json         # return mode "default": every event, every case
snapshots/return_values/<case>.json          # return mode "case": one payload for all 9 events
snapshots/return_values/<case>_<event>.json  # return mode "per-event": payload embeds event data
snapshots/return_values/<timeout-case>.txt  # RIE's plain-text timeout response
```

The normalized logs of most cases are identical across all five runtimes, so
a per-leg file would be dozens of copies of one expectation — and dozens of
files to review when one of them legitimately changes.

Two things make the sharing safe rather than lossy:

- **The runtime is asserted before it is collapsed.** `runtime:nodejsNN.x`
  and the `dd_lambda_layer:datadog-nodevNN.*` tag are the genuinely
  runtime-specific values in the logs. `run.sh` checks that they appear with
  the major actually under test (the runtime tag on every invocation), and
  only then rewrites them to `nodejsXX.x` / `nodevXX.XX.X`. Sharing the
  golden therefore does not stop the suite from checking that the library
  reports the runtime it is running on.
- **`AWS_LAMBDA_FUNCTION_NAME` carries no runtime major.** It propagates into
  `service`, `resource`, `resource_names`, `functionname`, `function_arn`,
  `_dd.base_service` and `_dd.tags.process`, so embedding the runtime there
  made every runtime's golden differ in ~100 lines of pure fixture naming,
  burying the lines that were actually runtime-specific.

Divergence is expressed by **adding a file**, never by loosening a comparison:

```
snapshots/logs/<case>_node<major>.log                       # overrides the shared log
snapshots/return_values/<case>_node<major>.json             # overrides the shared return value
snapshots/return_values/<case>_node<major>_<event>.json     # per-event, per-runtime
```

When an override is present it wins for that leg alone. This keeps a real
behavioral difference visible in review, whereas widening a normalization
filter to absorb it would be invisible. Current overrides:

- `manual-throw-error_node24.log` / `_node26.log` (+ return values): Node
  24+ runtimes add their own frames (`BufferedInvokeProcessor`, async
  `index.mjs` frames) to error stack traces.
- `cjs-http-requests_node18.log`: dd-trace's `dns`/`net` plugins fire on
  Node 18 only, adding `_dd.integration` span meta lines.
- `manual-http-requests_node18.log`: Node 18's HTTP agent sends
  `connection: close` where 20+ send `keep-alive`; the mock echo pins the
  difference.
- `cjs-proactive-init_node{18,20,24,26}.log`: Node's
  `TimeoutOverflowWarning` emission (count and JSON-record wrapping) varies
  by runtime major under the managed-instances path. The case's actual
  assertions — the proactive-initialization markers — are grep-checked on
  the raw logs and are identical on every runtime.

In update mode, the first leg writes the shared golden. Later legs in the
same run **fail** if they disagree instead of overwriting it — otherwise the
last runtime to run would silently define the expectation for all of them.
To capture a genuine per-runtime divergence, `touch` the override file first
so the write targets it.

## The mock HTTP server (cjs-http-requests, manual-http-requests)

Both HTTP cases exercise downstream header injection without touching
the network: `run.sh` creates a per-run docker network, starts a mock server
on it (reusing the Lambda base image with `--entrypoint node`), and passes
`MOCK_HTTP_URLS` to the fixture. The mock echoes the request headers it
received, so the golden pins exactly which trace-propagation headers the
library injected. Container-to-container traffic stays on the throwaway
network; only the readiness probe goes through the host.

The two cases cover the two injection paths: `cjs-http-requests` runs through
the redirect entry (dd-trace initialized → the tracer's http plugin injects),
while `manual-http-requests` is manual-wrapped with no tracer (TraceListener
falls back to the library's own `patchHttp`). See "Known emulation gaps" for
what the manual case cannot pin locally.

## Impending timeouts (manual-timeout, cjs-timeout)

These cases exercise both pre-migration dd-trace hook paths: manual
`datadog(handler)` wrapping and the `DD_LAMBDA_HANDLER` redirect. The manual
fixture initializes dd-trace **before** importing the shim; importing the shim
alone does not initialize tracing or install the timeout monitor.

The handler opens a `timeout.unfinished` child span and waits 60 seconds.
`AWS_LAMBDA_FUNCTION_TIMEOUT=5` gives the invocation a real RIE deadline, and
`DD_APM_FLUSH_DEADLINE_MILLISECONDS=3500` makes dd-trace flush roughly 1.5
seconds into the invocation (less the init time). RIE then kills the runtime
at five seconds. All nine input events are exercised, with a fresh runtime
after each timeout. The two cases add about 90 seconds per runtime leg.

RIE v1.36 returns HTTP 200 with the **plain text**
`Task timed out after 5.00 seconds`, not Lambda's JSON error envelope.
Consequently, these return goldens use `.txt`. Completion is gated on REPORT,
timeout-reset, and SIGKILL records; a killed runtime never emits INVOKE RTDONE.
The HTTP client is bounded to 15 seconds so a broken deadline cannot hang CI.

Before normalization or snapshot creation, `check-timeout-logs.js` reads all
trace payloads and asserts for every raw request ID:

- exactly one `aws.lambda` span across all payloads, with `error=1`,
  `error.type=Impending Timeout`, and the expected error message;
- exactly one unfinished child in that invocation's trace, with the invocation
  as its parent and no error on the child;
- both spans were exported before REPORT, and the invocation span finished
  within 2.5 seconds (the configured 1.5-second guard plus scheduling headroom,
  which also rejects silently falling back to the default 100ms flush deadline);
- RIE actually reset and killed the runtime once per invocation.

This catches duplicate invocation spans even when they appear in separate
traces, and prevents a metrics-only run from becoming a passing golden. The
helper preserves trace payloads unchanged. It normalizes only volatile IDs
and timestamps in RIE timeout diagnostics, including Go's varying log-field
order. Every diagnostic record and severity remains in the snapshot; the
shared AWS/RIE normalizer is unchanged.

Run the helper's regression tests independently with:

```bash
node --test integration_tests_local/check-timeout-logs.test.js
```

### Golden provenance

The timeout goldens were recaptured after merging main, from pre-migration
library commit `291fd14e9b8c54b94ba5b57998f726231839dc92`
(`datadog-lambda-js` 12.143.0), with no additional production-source changes.
Both cases used RIE v1.36 on `linux/arm64`, across Node 18/20/22/24/26. The
fixture runner installed dd-trace 5.126.0 on Node 18/20 and the lockfile-resolved
6.15.0 on Node 22/24/26. All five runtimes produced the same shared goldens;
no runtime-specific timeout overrides were needed.

Both cases passed a comparison-only rerun across all five runtimes (90
invocations), leaving all four timeout snapshot files byte-for-byte unchanged.

The existing `manual-throw-error` and `container-cjs` goldens also passed
unchanged on Node 22 through the same transport. The checker has nine
regression tests.

The previous files recorded the older `cf751a76` baseline with dd-trace
5.105.0 on every runtime. Those snapshots stopped matching after the main
merge: the current tracer omits empty `links: []` fields, and the shim resolves
the loaded tracer's version at runtime instead of recording an empty
`dd_trace` tag. The recapture changes only those fields and ordinary RIE
record ordering under the existing line-order comparison. Timeout error
decoration, span counts, parent/child relationships, and flush checks remain
unchanged. Neither the raw checker nor the shared normalizer was loosened.

When intentionally recapturing an existing shared golden, first review why
the baseline changed. The current runner lets the first leg overwrite a shared
golden in `UPDATE_SNAPSHOTS=true` mode and requires later legs in that run to
agree. Unlike the older capture baseline, it no longer requires deleting the
existing golden first.

The local capture used `RIE_HTTP_TRANSPORT=container` because Colima's
published host ports were unreachable. RIE was reachable over IPv4 inside
the containers, so this was not an IPv6-only RIE listener. This transport
does not alter the handler, tracer, invocation body, or RIE timeout.

These are L2 emulator goldens, not evidence of real AWS termination behavior
or layer packaging. The redirect case covers the raw-handler hook used by
layers; real AWS timeout behavior still needs L3 coverage. The CI workflow is
configured to compare these goldens on native amd64 and arm64; the local capture
used arm64.

## Proactive initialization (cjs-proactive-init)

The library stamps `initTime = Date.now()` at wrapper-module load
(`src/index.ts`) and marks the sandbox as proactively initialized when the
first invocation starts more than 10 s after that
(`src/utils/cold-start.ts`). On real Lambda, AWS sometimes runs the init
phase well before the first invoke (proactive initialization), flipping that
flag. **The classic RIE runs the init phase lazily on the first
invocation**, so a post-start `sleep` alone creates no init→invoke gap
(verified: with only a sleep, the logs are byte-identical to an immediate
run). The case therefore runs the same RIE binary in its managed-instances
path (`AWS_LAMBDA_MAX_CONCURRENCY=1`), which performs the init phase
**eagerly at container start**, then sleeps 15 s before the first
invocation. Side effects are contained: the function env gains
`AWS_LAMBDA_INITIALIZATION_TYPE=lambda-managed-instances`, which the library
only uses to gate cold-start tracing spans (already disabled here via
`DD_COLD_START_TRACING=false`), and `AWS_LAMBDA_LOG_FORMAT=text` is pinned
to keep runtime logs in the classic text format.

Instead of relying on the golden alone, `run.sh` greps the **raw** logs for
the three markers:

- `"proactive_initialization":1` in the `aws.lambda` span's `metrics`,
- `"proactive_initialization":true` in the `aws.lambda.enhanced.invocations`
  metric tags,
- `cold_start:false` on the first invocation.

## Pinned runtime infrastructure

All five Lambda base images are pinned to multi-architecture manifest digests
in `run.sh`'s `lambda_node_image_tag()`. The same reference is used by the CJS,
ESM, layer, and mock-server fixtures, with `PLATFORM` selecting amd64 or arm64.
The pins come from [CI run 36168116285](https://github.com/DataDog/datadog-lambda-js/actions/runs/36168116285)
on September 25, 2026. A warm local Docker cache and a clean CI runner must not
silently test different runtime releases under the same major-version tag.

That discrepancy caused two baseline changes with no library-source changes:
the newer Node 22/24 managed runtime emits a structured
`runtime_worker_pool_initializing` DEBUG record, and Node 24 now includes
`requestId` in its thrown-error response. The corresponding proactive-init log
goldens and Node 24 error-return golden were recaptured from the pre-migration
library at `8785aeee`, using the pinned images on arm64. The runtime record is
preserved in full, including `workerCount: 4` (the harness specifies `--cpus 4`)
and `executionEnvironmentMaxConcurrency: 1`; the response retains `requestId`
with its existing volatile-value normalization. The shared normalizer and the
three raw proactive-init assertions are unchanged.

After recapture, all 18 cases passed in comparison-only mode on both Node 22
and Node 24 / arm64 (324 invocations). The three refreshed expectations kept
the same hashes, and the timeout goldens were not changed by this refresh.

To update a runtime, change its digest in `lambda_node_image_tag()`, inspect
the runtime differences, and recapture only the affected expectations before
running comparison-only tests on both architectures. Do not remove runtime
records to make a new base image match an older golden.

The harness pins AWS Runtime Interface Emulator (RIE) `v1.36` and verifies the
cached binary on every run before mounting it into a container:

| Asset | SHA-256 |
|---|---|
| `aws-lambda-rie-x86_64` | `ba57f2683260127135ad5ba9bafea141f90492143cbaeb9312cde6dae8d1c08e` |
| `aws-lambda-rie-arm64` | `7826415f278663274e279085ff96d7c9da210a30213fa72279e56e59f028ce76` |

If `./bin/aws-lambda-rie` is absent or has a different checksum, `run.sh`
downloads and verifies the platform-specific asset before replacing the cache.

Node 26 is still preview-only in ECR Public: the bare
`public.ecr.aws/lambda/nodejs:26` tag does not exist. The logical runtime stays
`26` for image names, function names, and snapshot paths, while the Docker
base-image build argument maps to the dated multi-arch tag
`26-preview.2026.08.21.22` plus its manifest digest.

Node 26 is a strict leg like every other; where its preview runtime
genuinely diverges (error stack frames, warning emission) it carries
`*_node26` override goldens rather than widened normalization.

Architecture-only preview/deprecation noise is not a Node 26 behavioral
difference. Those records are removed before JSON formatting so their
timestamp/level/request-id envelopes cannot make the shared snapshots depend
on whether the test ran on amd64 or arm64.

When AWS publishes the bare Node 26 GA image, swap the pinned tag and re-run.
If GA output diverges further, add `*_node26` overrides captured from the
pinned pre-migration ref. Do not absorb the difference into the shared
integration-log normalizer because the oracle is tied to the implementation
under test. A base-image change must be reviewed, not hidden by normalization.

## Files

- `run.sh` — the runner (build images, run under RIE, invoke, diff snapshots)
- `../scripts/normalize_integration_logs.sh` — the shared AWS/RIE log normalizer.
  Reads stdin, writes stdout; honors `RUN_ID` for optional per-run ID stripping.
- `prepare-layer.js` — assembles the layer fixture's build context from the
  repo build, mirroring the release Dockerfile's `/opt` layout
- `check-timeout-logs.js` — validates raw timeout traces and normalizes only
  the timeout-specific RIE diagnostics before the shared normalizer
- `bin/` — downloaded RIE binary (gitignored)
- `snapshots/logs/` — normalized log snapshots, shared per case across
  runtimes, with optional `<case>_node<major>.log` overrides
- `snapshots/return_values/` — handler return-value snapshots (per case,
  per event, or the shared `default.json`), with optional
  `<case>_node<major>[_<event>].json` overrides

## Comparison with the deprecated real AWS Lambda resource-based suite

> The in-repo real AWS Lambda resource-based suite was deprecated in favor of
> this RIE-based suite. Real AWS Lambda resource cases rely on the end-to-end
> test suites. This table is kept for historical context.

| | Deprecated AWS suite (`scripts/run_integration_tests.sh`) | this harness |
|---|---|---|
| handlers | layer, container, and manual-wrap variants | container + layer + manual-wrap cases |
| infra | real Lambda via serverless, CloudWatch logs | docker + RIE, `docker logs` |
| snapshots | `integration_tests/snapshots/` | `integration_tests_local/snapshots/` |
| credentials | AWS account + DD_API_KEY | none |
| cost/wait | deploy + invoke + 20 s log wait | image build + invoke |

Local snapshots legitimately differ from the AWS ones (fake account/region
context, no real API Gateway IDs, RIE-formatted `START`/`END`/`REPORT`
lines, no platform `init:` duration suffix, mock-server URLs instead of real
endpoints). Do not diff one suite's output against the other's snapshots.

## Known emulation gaps (RIE vs real Lambda)

- The classic RIE runs the init phase **lazily on the first invocation**;
  the `cjs-proactive-init` case uses the eager-init managed-instances path
  to observe init→invoke timing behavior (see above).
- No platform `INIT_START` / `END ... (init: N ms)` lines — those come from
  the Lambda platform, not the runtime.
- No real AWS service context: API Gateway/DynamoDB/S3/SNS/SQS resource ARNs,
  account IDs, and inferred-span metadata are derived only from the event
  payloads, so they differ from the AWS snapshots.
- `AWS_REGION` is faked to `eu-west-1` to keep the enhanced-metric region
  tag stable.
- Enhanced metrics that depend on platform-provided values (e.g. real
  memory size / billed duration) may be absent or differ.
- `_X_AMZN_TRACE_ID` cannot be emulated: the RIC owns that variable and
  clears it per invocation, so neither a container env var, an invoke-request
  header, nor a module-load assignment survives to extraction time. On real
  Lambda the platform's pass-through trace header is what gives the
  manual-wrap `patchHttp` path a context to inject; locally the
  `manual-http-requests` golden therefore pins `TraceHeaders: []` plus the
  mock echo of the exact header set. The wiring (patch, wrap, per-request
  log) is fully covered — a migration that breaks it fails the golden — but
  the injected header *values* on that path are pinned only by the
  `patch-http` unit tests and the AWS suite.
- The layer fixture installs into a plain `/opt/nodejs/node_modules`
  directory rather than a real published layer zip, so layer-version
  metadata (e.g. an exact layer ARN in tags) cannot be reproduced locally.

Deliberately not covered locally (each has an assigned owner — do not re-add
here without closing that owner first):

- response streaming and `time_to_first_byte` — RIE cannot stream
  invocations; owned by the `serverless-e2e-tests` lambda-features suite.
- direct-API and KMS/Secrets Manager metric key paths — need real AWS;
  unit specs plus an L3 spot-check.
- aws-sdk v2/v3 client spans in the lambda context (parenting under
  `aws.lambda`, flush before invocation end) — need real AWS services;
  owned by L3.
- durable-execution checkpoint extraction — owned by
  `serverless-e2e-tests/durable-functions`.
