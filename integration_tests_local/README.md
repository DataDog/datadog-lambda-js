# Local integration tests (docker + AWS RIE, no AWS account required)

This directory contains a **local** integration test harness for
datadog-lambda-js. It runs eleven cases — container-image, layer-mode, and
manual-wrap handlers, plus targeted feature cases (HTTP header injection,
custom trace extractors, proactive initialization) — inside Docker against the
[AWS Lambda Runtime Interface Emulator (RIE)](https://github.com/aws/aws-lambda-runtime-interface-emulator),
invokes them with the same input events as the AWS-based suite, captures
logs from `docker logs`, normalizes them with `./normalize.sh` — the AWS
suite's filter chain plus documented RIE-specific handling, not an identical
copy — and diffs them against **local** snapshots in `./snapshots/`.

The case set is deliberately at least as wide as the AWS-based suite
(`integration_tests/serverless.yml`): every behavior the old suite pinned
has a docker-based counterpart here, so the frozen goldens are a strict
superset oracle for the dd-trace-js migration.

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
```

The case names are:

| Case | What it covers |
|---|---|
| `container-cjs` / `container-esm` | npm-redirect container handlers (CJS / ESM entry), the default onboarding path |
| `layer-cjs` / `layer-esm` | layer-mode handlers loaded from `/opt/nodejs/node_modules/datadog-lambda-js` (CJS / ESM entry) |
| `manual-throw-error` | manual `datadog(handler)` wrap of a throwing handler; error body + enhanced error metrics |
| `manual-status-500` | manual wrap with userland `dd-trace` init returning a 500 API Gateway response (`DD_TRACE_ENABLED=true`); error span tag + enhanced error metrics |
| `manual-send-metrics` | manual wrap calling `sendDistributionMetric` inside and outside the handler; per-event return values |
| `manual-process-input` | manual wrap with userland `dd-trace` init reading the active span; per-event return values |
| `cjs-http-requests` | downstream HTTP calls against a hermetic mock server; asserts injected `x-datadog-*`/`traceparent` headers and log injection |
| `cjs-custom-extractor` | `DD_TRACE_EXTRACTOR=extractor.extract`; asserts `_dd.parent_source: event` on the inferred span |
| `cjs-proactive-init` | eager-init managed-instances RIE path with a 15 s init→invoke gap; asserts proactive-initialization markers on the raw logs |

Two legacy aliases remain for muscle memory: `VARIANT_PARAM=cjs|esm` maps to
`container-cjs`/`container-esm`, and `SIMULATE_PROACTIVE_INIT=true` maps to
`CASE_PARAM=cjs-proactive-init`.

Unless `SKIP_PACK=true` is set, each run repacks the library under test
(`yarn install --frozen-lockfile && yarn build && npm pack`) into
`integration_tests/container/{cjs,esm}/datadog-lambda-js-local.tgz`, exactly
like `scripts/run_integration_tests.sh` does, so the containers always test
the working tree. The layer fixture instead assembles
`integration_tests/container/layer/layer_pkg/` from the repo build via
`prepare-layer.js`, mirroring the release Dockerfile's layer layout, with
dependency versions pinned from the lockfile-resolved `node_modules` set.

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
- `cjs-proactive-init_node{18,20,24,26}.log`: Node's
  `TimeoutOverflowWarning` emission (count and JSON-record wrapping) varies
  by runtime major under the managed-instances path. The case's actual
  assertions — the proactive-initialization markers — are grep-checked on
  the raw logs and are identical on every runtime.

In update mode, a leg that disagrees with an existing shared golden **fails**
instead of overwriting it — otherwise the last runtime to run would silently
define the expectation for all of them. To capture a genuine per-runtime
divergence, `touch` the override file first so the write targets it.

## The mock HTTP server (cjs-http-requests)

`cjs-http-requests` exercises downstream header injection without touching
the network: `run.sh` creates a per-run docker network, starts a mock server
on it (reusing the Lambda base image with `--entrypoint node`), and passes
`MOCK_HTTP_URLS` to the fixture. The mock echoes the request headers it
received, so the golden pins exactly which trace-propagation headers the
library injected. Container-to-container traffic stays on the throwaway
network; only the readiness probe goes through the host.

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
`26-preview.2026.08.21.22`.

Node 26 is a strict leg like every other; where its preview runtime
genuinely diverges (error stack frames, warning emission) it carries
`*_node26` override goldens rather than widened normalization.

When AWS publishes the bare Node 26 GA image, swap the pinned tag and re-run.
If GA output diverges further, add `*_node26` overrides captured from the
pinned pre-migration ref rather than absorbing the difference into
`normalize.sh` — the oracle is tied to the implementation under test, and a
base-image change must be reviewed, not hidden by normalization.

## Files

- `run.sh` — the runner (build images, run under RIE, invoke, diff snapshots)
- `normalize.sh` — the local log-normalization pipeline, based on the AWS
  suite's filters with documented RIE-specific handling. Reads stdin, writes
  stdout; honors `RUN_ID` for optional per-run ID stripping.
- `prepare-layer.js` — assembles the layer fixture's build context from the
  repo build, mirroring the release Dockerfile's `/opt` layout
- `bin/` — downloaded RIE binary (gitignored)
- `snapshots/logs/` — normalized log snapshots, shared per case across
  runtimes, with optional `<case>_node<major>.log` overrides
- `snapshots/return_values/` — handler return-value snapshots (per case,
  per event, or the shared `default.json`), with optional
  `<case>_node<major>[_<event>].json` overrides

## Comparison with the AWS-based suite

| | AWS suite (`scripts/run_integration_tests.sh`) | this harness |
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
- The layer fixture installs into a plain `/opt/nodejs/node_modules`
  directory rather than a real published layer zip, so layer-version
  metadata (e.g. an exact layer ARN in tags) cannot be reproduced locally.
