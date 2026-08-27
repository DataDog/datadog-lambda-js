# Local integration tests (docker + AWS RIE, no AWS account required)

This directory contains a **local** integration test harness for
datadog-lambda-js. It runs the container-image handler variants
(`integration_tests/container/cjs` and `integration_tests/container/esm`)
inside Docker against the
[AWS Lambda Runtime Interface Emulator (RIE)](https://github.com/aws/aws-lambda-runtime-interface-emulator),
invokes them with the same input events as the AWS-based suite, captures
logs from `docker logs`, normalizes them with `./normalize.sh` — the AWS
suite's filter chain plus documented RIE-specific handling, not an identical
copy — and diffs them against **local** snapshots in `./snapshots/`.

Nothing here touches AWS, and nothing here touches
`integration_tests/snapshots/` (the AWS suite's snapshots).

## Prerequisites

- Docker (tested with colima on macOS arm64)
- `node`, `yarn`, `perl`, `sed`, `curl` (all already used by the AWS suite)
- Network access for the first run (pulls `public.ecr.aws/lambda/nodejs:*`
  base images, ~1 GB each, and downloads the pinned RIE binary into `./bin/`)

## Running

```bash
# All checked-in snapshots: nodejs 18/20/22/24 x {cjs, esm}
./integration_tests_local/run.sh

# Generate the temporary Node 26 baseline used by PR 1
UPDATE_SNAPSHOTS=true RUNTIME_PARAM=26 ./integration_tests_local/run.sh

# One runtime / one variant
RUNTIME_PARAM=18 VARIANT_PARAM=esm ./integration_tests_local/run.sh

# (Re)generate local snapshots
UPDATE_SNAPSHOTS=true ./integration_tests_local/run.sh

# Skip repacking the library (reuse container/*/datadog-lambda-js-local.tgz)
SKIP_PACK=true RUNTIME_PARAM=18 VARIANT_PARAM=esm ./integration_tests_local/run.sh

# Force amd64 images instead of arm64
PLATFORM=linux/amd64 ./integration_tests_local/run.sh
```

Unless `SKIP_PACK=true` is set, each run repacks the library under test
(`yarn install --frozen-lockfile && yarn build && npm pack`) into
`integration_tests/container/{cjs,esm}/datadog-lambda-js-local.tgz`, exactly
like `scripts/run_integration_tests.sh` does, so the containers always test
the working tree.

Without `UPDATE_SNAPSHOTS=true`, every expected return-value and log snapshot
must already exist. A missing snapshot fails the run and is never created
implicitly. Update mode is the only path that creates or overwrites snapshots.

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

PR 1 generates all 20 Node 26 artifacts in CI without committing them. PR 2
reviews and adds those snapshots, completing the 100-snapshot baseline and
turning all five runtime jobs into strict comparisons.

When AWS publishes the bare Node 26 GA image, re-capture the Node 26 goldens
from the pinned pre-migration ref before the old business logic is deleted.
The oracle is tied to the implementation under test, and the GA base-image
change must be reviewed rather than hidden by normalization.

## Proactive-initialization simulation

```bash
SIMULATE_PROACTIVE_INIT=true RUNTIME_PARAM=18 VARIANT_PARAM=esm ./integration_tests_local/run.sh
```

The library stamps `initTime = Date.now()` at wrapper-module load
(`src/index.ts`) and marks the sandbox as proactively initialized when the
first invocation starts more than 10 s after that
(`src/utils/cold-start.ts`). On real Lambda, AWS sometimes runs the init
phase well before the first invoke (proactive initialization), flipping that
flag.

Reproducing this under RIE takes two ingredients, because **the classic RIE
runs the init phase lazily on the first invocation** — a post-start `sleep`
alone creates no init→invoke gap (verified: with only a sleep, the logs are
byte-identical to an immediate run):

1. `run.sh` sets `AWS_LAMBDA_MAX_CONCURRENCY=1`, which switches the same RIE
   binary into its managed-instances path; that path performs the init phase
   (bootstrap + wrapper module load) **eagerly at container start**. Side
   effects are contained: the function env gains
   `AWS_LAMBDA_INITIALIZATION_TYPE=lambda-managed-instances`, which the
   library only uses to gate cold-start tracing spans (already disabled here
   via `DD_COLD_START_TRACING=false`), and `AWS_LAMBDA_LOG_FORMAT=text` is
   pinned to keep runtime logs in the classic text format.
2. `run.sh` then sleeps 15 s before the first invocation, producing an
   init→invoke gap > 10 s.

The first invocation then emits, exactly as in the CI failure on
`container-esm_node18`:

- `"proactive_initialization": 1` in the `aws.lambda` span's `metrics`,
- `"proactive_initialization:true"` in the `aws.lambda.enhanced.invocations`
  metric tags,
- `cold_start:false` (instead of `true`) on the first invocation.

A `SIMULATE_PROACTIVE_INIT=true` run is therefore **expected to fail** the
diff against the immediate-run snapshots, with precisely those lines added
(plus RIE-mode platform-log noise: `INIT/REPORT` line shapes and the emulated
region/account in ARNs differ between the two RIE paths). The platform-side
half of the CI diff, `END Duration: XXXX ms (init: XXXX ms)`, is emitted by
the real Lambda platform and does not appear under RIE in either mode.

## Files

- `run.sh` — the runner (build images, run under RIE, invoke, diff snapshots)
- `normalize.sh` — the local log-normalization pipeline, based on the AWS
  suite's filters with documented RIE-specific handling. Reads stdin, writes
  stdout; honors `RUN_ID` for optional per-run ID stripping.
- `bin/` — downloaded RIE binary (gitignored)
- `snapshots/logs/` — normalized log snapshots per variant+runtime
- `snapshots/return_values/` — per-event handler return-value snapshots

## Comparison with the AWS-based suite

| | AWS suite (`scripts/run_integration_tests.sh`) | this harness |
|---|---|---|
| handlers | 9 variants (layers + container images) | container images only (cjs, esm) |
| infra | real Lambda via serverless, CloudWatch logs | docker + RIE, `docker logs` |
| snapshots | `integration_tests/snapshots/` | `integration_tests_local/snapshots/` |
| credentials | AWS account + DD_API_KEY | none |
| cost/wait | deploy + invoke + 20 s log wait | image build + invoke |

Local snapshots legitimately differ from the AWS ones (fake account/region
context, no real API Gateway IDs, RIE-formatted `START`/`END`/`REPORT`
lines, no platform `init:` duration suffix). Do not diff one suite's output
against the other's snapshots.

## Known emulation gaps (RIE vs real Lambda)

- The classic RIE runs the init phase **lazily on the first invocation**, so
  init→invoke timing behavior (proactive initialization) cannot be observed
  in the default mode; use `SIMULATE_PROACTIVE_INIT=true`, which switches
  RIE to its eager-init managed-instances path (see above).
- No platform `INIT_START` / `END ... (init: N ms)` lines — those come from
  the Lambda platform, not the runtime.
- No real AWS service context: API Gateway/DynamoDB/S3/SNS/SQS resource ARNs,
  account IDs, and inferred-span metadata are derived only from the event
  payloads, so they differ from the AWS snapshots.
- `AWS_REGION` is faked to `eu-west-1` to keep the enhanced-metric region
  tag stable.
- Enhanced metrics that depend on platform-provided values (e.g. real
  memory size / billed duration) may be absent or differ.
- Onboarding-mode coverage is partial, and it is two modes short, not three.
  Both container fixtures end in
  `CMD ["node_modules/datadog-lambda-js/dist/handler.handler"]`, so the
  **npm-installed** handler path is already exercised on every runtime. What
  this harness does not cover is the **layer** path
  (`/opt/nodejs/node_modules/datadog-lambda-js/handler.handler`, which needs the
  built layer zip and a zip-based deployment model) and **manual**
  `datadog(handler)` wrapping in customer code. Adding those two means new
  fixtures and a larger snapshot count, so they belong to a separately scoped
  follow-up rather than to the harness-hardening PR.
