#!/bin/bash

# Local (docker-based) integration tests for datadog-lambda-js.
#
# Runs the test cases below against the AWS Runtime Interface Emulator (RIE)
# — no AWS account needed. Logs are captured from `docker logs`, normalized
# with ./normalize.sh, and diffed against LOCAL snapshots in ./snapshots/
# (not integration_tests/snapshots/).
#
# The case set is deliberately at least as wide as the AWS-based suite in
# integration_tests/serverless.yml: every handler variant that suite deploys
# has a docker-based counterpart here, so the frozen goldens are not a
# coverage regression relative to the tests we had before the migration.
#
# Case                     | image | entrypoint handler                       | what it covers
# ------------------------ | ----- | ---------------------------------------- | --------------
# container-cjs            | cjs   | node_modules/datadog-lambda-js/dist/handler.handler | npm redirect mode, CJS user handler
# container-esm            | esm   | node_modules/datadog-lambda-js/dist/handler.handler | npm redirect mode, ESM/TLA user handler (ERR_REQUIRE_ESM guard)
# layer-cjs                | layer | /opt/nodejs/node_modules/datadog-lambda-js/handler.handler | layer handler path, CJS user handler
# layer-esm                | layer | /opt/nodejs/node_modules/datadog-lambda-js/handler.handler | layer handler path + ESM loader registration, TLA
# manual-throw-error       | cjs   | throw-error.handle                       | manual datadog() wrap; thrown error -> span error + rethrow
# manual-status-500        | cjs   | status-code-500s.handle                  | manual wrap; API GW 500 -> span error + enhanced error metric
# manual-send-metrics      | cjs   | send-metrics.handle                      | manual wrap; sendDistributionMetric via DD_FLUSH_TO_LOG
# manual-process-input     | cjs   | process-input.handle                     | manual wrap; dd-trace child spans via tracer.wrap
# cjs-async-context       | cjs   | node_modules/datadog-lambda-js/dist/handler.handler | npm redirect; AsyncLocalStorage request context with Winston log correlation
# cjs-http-requests       | cjs   | node_modules/datadog-lambda-js/dist/handler.handler | npm redirect; downstream HTTP header injection via dd-trace's http plugin (hermetic mock server)
# manual-http-requests    | cjs   | http-requests-manual.handle              | manual wrap; patchHttp fallback wrapping + per-request logging (hermetic mock)
# cjs-custom-extractor     | cjs   | node_modules/datadog-lambda-js/dist/handler.handler | DD_TRACE_EXTRACTOR custom extractor + _dd.parent_source
# cjs-proactive-init       | cjs   | node_modules/datadog-lambda-js/dist/handler.handler | proactive-initialization markers (raw-log assertions)
#
# Usage (from repo root or this directory):
#   ./integration_tests_local/run.sh                 # all runtimes, all cases
#   RUNTIME_PARAM=18 ./integration_tests_local/run.sh
#   RUNTIME_PARAM=18 CASE_PARAM=layer-cjs ./integration_tests_local/run.sh
#   UPDATE_SNAPSHOTS=true ./integration_tests_local/run.sh
#
# Env knobs:
#   RUNTIME_PARAM            - node major version: 18|20|22|24|26 (default: all)
#   CASE_PARAM               - one case from the table above (default: all)
#   VARIANT_PARAM            - legacy alias: cjs -> container-cjs, esm -> container-esm
#   SIMULATE_PROACTIVE_INIT  - legacy alias for CASE_PARAM=cjs-proactive-init
#   PLATFORM                 - docker platform (default: linux/arm64)
#   UPDATE_SNAPSHOTS=true    - overwrite local snapshots instead of diffing
#   SKIP_PACK=true           - reuse existing container/*/datadog-lambda-js-local.tgz
#                              and the existing layer fixture context

set -e

# Reject arguments; configuration is environment-only.
if [ "$#" -gt 0 ]; then
    echo "Unexpected argument: $1" >&2
    echo "This script takes no flags or positional arguments; use the env knobs, e.g." >&2
    echo "  RUNTIME_PARAM=18 CASE_PARAM=layer-cjs $0" >&2
    exit 2
fi

script_path=${BASH_SOURCE[0]}
local_dir=$(cd "$(dirname "$script_path")" && pwd)
repo_dir=$(dirname "$local_dir")
integration_tests_dir="$repo_dir/integration_tests"

PLATFORM=${PLATFORM:-linux/arm64}
RIE_VERSION=1.36
case "$PLATFORM" in
    linux/arm64)
        RIE_ASSET=aws-lambda-rie-arm64
        RIE_SHA256=7826415f278663274e279085ff96d7c9da210a30213fa72279e56e59f028ce76
        ;;
    linux/amd64)
        RIE_ASSET=aws-lambda-rie-x86_64
        RIE_SHA256=ba57f2683260127135ad5ba9bafea141f90492143cbaeb9312cde6dae8d1c08e
        ;;
    *) echo "Unsupported PLATFORM: $PLATFORM (use linux/arm64 or linux/amd64)"; exit 1 ;;
esac

function contains() {
    local candidate=$1
    shift
    local item
    for item in "$@"; do
        if [ "$item" = "$candidate" ]; then
            return 0
        fi
    done
    return 1
}

SUPPORTED_RUNTIMES=("18" "20" "22" "24" "26")
RUNTIMES=("${SUPPORTED_RUNTIMES[@]}")
if [ -n "${RUNTIME_PARAM:-}" ]; then
    if ! contains "$RUNTIME_PARAM" "${SUPPORTED_RUNTIMES[@]}"; then
        echo "Unsupported RUNTIME_PARAM: $RUNTIME_PARAM (use 18, 20, 22, 24, or 26)"
        exit 1
    fi
    echo "Node version is specified: $RUNTIME_PARAM"
    RUNTIMES=("$RUNTIME_PARAM")
else
    echo "Node version not specified, running for all node versions."
fi

# --- Case registry ---------------------------------------------------------
# configure_case sets the case_* variables consumed by the run loop. Kept as
# a function over a case statement because this script still runs on the
# bash 3.2 that ships with macOS (no associative arrays).

ALL_CASES=(
    "container-cjs"
    "container-esm"
    "layer-cjs"
    "layer-esm"
    "manual-throw-error"
    "manual-status-500"
    "manual-send-metrics"
    "manual-process-input"
    "cjs-async-context"
    "cjs-http-requests"
    "manual-http-requests"
    "cjs-custom-extractor"
    "cjs-proactive-init"
)

function configure_case() {
    case_name=$1
    # Defaults; cases override what they need.
    case_image=""
    case_entry_handler=""
    case_extra_env=()
    case_expect_error=false
    case_proactive=false
    case_needs_mock=false
    # Return-value golden shape:
    #   default   - every event returns the shared default.json payload
    #   case      - every event returns one case-specific payload (error bodies)
    #   per-event - each event gets its own golden (payloads embed event data)
    case_return_mode=default
    # sed -E expression applied to return values before comparison (for
    # stack-trace line numbers, which legitimately shift when fixture files
    # change).
    case_return_filter=""

    case "$case_name" in
        container-cjs)
            case_image=cjs
            case_entry_handler="node_modules/datadog-lambda-js/dist/handler.handler"
            case_extra_env=(-e DD_LAMBDA_HANDLER=handler.handle)
            ;;
        container-esm)
            case_image=esm
            case_entry_handler="node_modules/datadog-lambda-js/dist/handler.handler"
            case_extra_env=(-e DD_LAMBDA_HANDLER=handler.handle)
            ;;
        layer-cjs)
            case_image=layer
            case_entry_handler="/opt/nodejs/node_modules/datadog-lambda-js/handler.handler"
            case_extra_env=(-e DD_LAMBDA_HANDLER=handler.handle)
            ;;
        layer-esm)
            case_image=layer
            case_entry_handler="/opt/nodejs/node_modules/datadog-lambda-js/handler.handler"
            case_extra_env=(-e DD_LAMBDA_HANDLER=esm.handle)
            ;;
        manual-throw-error)
            case_image=cjs
            case_entry_handler="throw-error.handle"
            case_expect_error=true
            case_return_mode=case
            # Stack frames carry line:col that shift with fixture edits and
            # node-internal frames whose line numbers vary by Node major.
            # The node26 preview RIC embeds a per-invocation requestId in the
            # error body; strip it wherever it appears.
            case_return_filter='s/:[0-9]+:[0-9]+([\)"])/:XXX:XXX\1/g; s/"requestId":"[0-9a-f-]+"/"requestId":"XXXX"/g'
            ;;
        manual-status-500)
            case_image=cjs
            case_entry_handler="status-code-500s.handle"
            case_extra_env=(-e DD_TRACE_ENABLED=true)
            case_return_mode=case
            ;;
        manual-send-metrics)
            case_image=cjs
            case_entry_handler="send-metrics.handle"
            case_return_mode=per-event
            ;;
        manual-process-input)
            case_image=cjs
            case_entry_handler="process-input.handle"
            case_return_mode=per-event
            ;;
        cjs-async-context)
            case_image=cjs
            case_entry_handler="node_modules/datadog-lambda-js/dist/handler.handler"
            case_extra_env=(-e DD_LAMBDA_HANDLER=async-context.handle -e DD_LOGS_INJECTION=true)
            ;;
        cjs-http-requests)
            # Redirect mode, not manual wrap: redirect mode initializes
            # dd-trace before the user handler loads, so the tracer's http
            # plugin does the injection and the golden pins full trace JSON.
            # The manual-wrap fallback (patchHttp) is covered separately by
            # manual-http-requests below.
            case_image=cjs
            case_entry_handler="node_modules/datadog-lambda-js/dist/handler.handler"
            case_needs_mock=true
            case_extra_env=(-e DD_LAMBDA_HANDLER=http-requests.handle -e "MOCK_HTTP_URLS=http://mock-http:8080/ip-ranges-us,http://mock-http:8080/ip-ranges-eu")
            ;;
        manual-http-requests)
            # Manual wrap without a userland dd-trace init — the exact shape
            # of the AWS suite's http-requests function. TraceListener falls
            # back to the library's own patchHttp (src/trace/patch-http.ts),
            # which injects the x-datadog-* headers and logs
            # "GET <url> TraceHeaders: [...]" per request; the mock echo pins
            # the same headers a second way. No trace JSON on this path (true
            # in the AWS suite as well).
            #
            # patchHttp needs an extracted trace context to inject headers.
            # On real Lambda that context is the platform's pass-through
            # _X_AMZN_TRACE_ID; under RIE it cannot be emulated (the RIC owns
            # the variable, and event-based extraction needs a tracer, which
            # this path deliberately lacks). The golden therefore pins what
            # is observable here: patchHttp wraps and logs every request
            # ("HTTP GET ... TraceHeaders: []"), the mock echo pins the exact
            # header set sent, and any change to either fails the case. The
            # context-dependent header values are pinned by the patch-http
            # unit tests and the AWS suite; see README "Known emulation gaps".
            case_image=cjs
            case_entry_handler="http-requests-manual.handle"
            case_needs_mock=true
            case_extra_env=(-e "MOCK_HTTP_URLS=http://mock-http:8080/ip-ranges-us,http://mock-http:8080/ip-ranges-eu")
            ;;
        cjs-custom-extractor)
            case_image=cjs
            case_entry_handler="node_modules/datadog-lambda-js/dist/handler.handler"
            case_extra_env=(-e DD_LAMBDA_HANDLER=handler.handle -e DD_TRACE_EXTRACTOR=extractor.extract)
            ;;
        cjs-proactive-init)
            case_image=cjs
            case_entry_handler="node_modules/datadog-lambda-js/dist/handler.handler"
            # Managed-instances mode initializes eagerly; the 15s delay before
            # the first invoke creates the init->invoke gap that marks the
            # invocation as proactively initialized.
            case_extra_env=(-e DD_LAMBDA_HANDLER=handler.handle -e AWS_LAMBDA_MAX_CONCURRENCY=1 -e AWS_LAMBDA_LOG_FORMAT=text)
            case_proactive=true
            ;;
        *)
            echo "Unsupported case: $case_name" >&2
            return 1
            ;;
    esac
}

CASES=("${ALL_CASES[@]}")
if [ -n "${SIMULATE_PROACTIVE_INIT:-}" ]; then
    # Legacy alias from before proactive init became a regular case.
    CASE_PARAM=cjs-proactive-init
fi
if [ -n "${VARIANT_PARAM:-}" ]; then
    # Legacy alias from before the harness had cases.
    case "$VARIANT_PARAM" in
        cjs) CASE_PARAM=container-cjs ;;
        esm) CASE_PARAM=container-esm ;;
        *) echo "Unsupported VARIANT_PARAM: $VARIANT_PARAM (use cjs or esm)"; exit 1 ;;
    esac
fi
if [ -n "${CASE_PARAM:-}" ]; then
    if ! contains "$CASE_PARAM" "${ALL_CASES[@]}"; then
        echo "Unsupported CASE_PARAM: $CASE_PARAM (use one of: ${ALL_CASES[*]})"
        exit 1
    fi
    echo "Case is specified: $CASE_PARAM"
    CASES=("$CASE_PARAM")
else
    echo "Case not specified, running all cases."
fi

update_snapshots=false
case "${UPDATE_SNAPSHOTS:-}" in
    "") ;;
    true) update_snapshots=true ;;
    *) echo "Unsupported UPDATE_SNAPSHOTS value: $UPDATE_SNAPSHOTS (use true or leave unset)"; exit 1 ;;
esac
if [ "$update_snapshots" = true ]; then
    echo "Overwriting snapshots in this execution"
fi

mismatch_found=false
container_ids=()
rie_download=""
mock_cid=""
mock_network="dd-l2-mock-$$"

function cleanup() {
    if [ -n "$rie_download" ] && [ -f "$rie_download" ]; then
        rm -f "$rie_download"
    fi
    for cid in "${container_ids[@]}"; do
        # Containers removed inline leave an empty slot behind (the
        # "${array[@]/$cid}" idiom blanks rather than unsets).
        [ -n "$cid" ] || continue
        docker rm -f "$cid" >/dev/null 2>&1 || true
    done
    if [ -n "$mock_cid" ]; then
        docker rm -f "$mock_cid" >/dev/null 2>&1 || true
    fi
    docker network rm "$mock_network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Download the pinned RIE binary into ./bin (gitignored). Verify the cached
# file on every run so an older `latest` download cannot silently survive.
rie_binary="$local_dir/bin/aws-lambda-rie"
rie_actual_sha256=""
if [ -f "$rie_binary" ]; then
    rie_actual_sha256=$(shasum -a 256 "$rie_binary" | awk '{print $1}')
fi
if [ "$rie_actual_sha256" != "$RIE_SHA256" ]; then
    if [ -n "$rie_actual_sha256" ]; then
        echo "Cached RIE checksum does not match v$RIE_VERSION; downloading the pinned binary"
    else
        echo "Downloading AWS Runtime Interface Emulator v$RIE_VERSION ($RIE_ASSET)"
    fi
    mkdir -p "$local_dir/bin"
    rie_download=$(mktemp "$local_dir/bin/aws-lambda-rie.XXXXXX")
    curl -fSL --retry 3 -o "$rie_download" \
        "https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/download/v$RIE_VERSION/$RIE_ASSET"
    rie_actual_sha256=$(shasum -a 256 "$rie_download" | awk '{print $1}')
    if [ "$rie_actual_sha256" != "$RIE_SHA256" ]; then
        echo "FAILURE: RIE checksum mismatch for $RIE_ASSET" >&2
        echo "Expected: $RIE_SHA256" >&2
        echo "Actual:   $rie_actual_sha256" >&2
        exit 1
    fi
    chmod +x "$rie_download"
    mv "$rie_download" "$rie_binary"
    rie_download=""
fi

# Build and pack the locally-modified datadog-lambda-js so the container-image
# tests install the version under test (same as scripts/run_integration_tests.sh).
if [ -z "$SKIP_PACK" ]; then
    echo "Packing local datadog-lambda-js for container tests"
    cd "$repo_dir"
    if [ -f "$repo_dir/scripts/install_deps.sh" ]; then
        # dd-trace v6 world: the repo pins a tracer whose engines may reject
        # the host node (e.g. v6 requires node >=22 while CI hosts node 18).
        # install_deps.sh installs the tracer line matching the target
        # runtime, rewriting package.json/yarn.lock and restoring them via a
        # trap on exit, so the worktree is left untouched.
        # NOTE: in the v6 world a full local sweep packs once with
        # TARGET_NODE_MAJOR=$RUNTIME_PARAM (default 22); run per-runtime like
        # CI does (RUNTIME_PARAM=18 ./integration_tests_local/run.sh) so the
        # layer fixture's pinned dd-trace matches each leg.
        TARGET_NODE_MAJOR=${RUNTIME_PARAM:-22} "$repo_dir/scripts/install_deps.sh"
    else
        yarn install --frozen-lockfile
    fi
    yarn build
    npm pack
    cp datadog-lambda-js-*.tgz "$integration_tests_dir/container/cjs/datadog-lambda-js-local.tgz"
    cp datadog-lambda-js-*.tgz "$integration_tests_dir/container/esm/datadog-lambda-js-local.tgz"
    rm -f datadog-lambda-js-*.tgz
else
    echo "SKIP_PACK: reusing existing container/*/datadog-lambda-js-local.tgz"
fi

# The layer fixture's build context is derived from the repo build (dist/ +
# handler.mjs + the module_importer overlay + lockfile-pinned dependencies),
# mirroring the release Dockerfile's layer layout. Prepared once per run.
layer_context_prepared=false
function prepare_layer_context() {
    if [ "$layer_context_prepared" = true ]; then
        return
    fi
    if [ -n "$SKIP_PACK" ] && [ -f "$integration_tests_dir/container/layer/deps.package.json" ]; then
        echo "SKIP_PACK: reusing existing container/layer context"
    else
        node "$local_dir/prepare-layer.js" "$repo_dir" "$integration_tests_dir/container/layer"
    fi
    layer_context_prepared=true
}

# Hermetic stand-in for the ip-ranges endpoints the AWS suite's http-requests
# handler calls. Runs on a per-run docker network as `mock-http`, reusing the
# already-pulled Lambda base image so no extra image download is needed. It
# echoes the request headers back, and the fixture handler logs them, so the
# golden shows the injected downstream trace context.
mock_script='const http=require("http");http.createServer((req,res)=>{res.setHeader("content-type","application/json");res.end(JSON.stringify({url:req.url,headers:req.headers}));}).listen(8080);'
mock_started=false
function start_mock() {
    local base_image=$1
    if [ "$mock_started" = true ]; then
        return
    fi
    echo "=== Starting mock-http server on network $mock_network ==="
    docker network create "$mock_network" >/dev/null
    mock_cid=$(docker run -d --rm --network "$mock_network" --network-alias mock-http \
        -p 127.0.0.1::8080 \
        --entrypoint /var/lang/bin/node \
        "$base_image" -e "$mock_script")
    local port ready=false
    port=$(docker port "$mock_cid" 8080 | head -1 | sed 's/.*://')
    for i in $(seq 1 40); do
        # HTTP-level probe: a bare TCP connect can succeed against the Docker
        # Desktop port proxy before the backend is reachable, which then
        # drops the next real request ("empty reply"). Any HTTP response —
        # the mock 200s every path — proves the full path works.
        if curl -s -o /dev/null --max-time 2 "http://localhost:$port/"; then
            ready=true
            break
        fi
        sleep 0.25
    done
    if [ "$ready" != true ]; then
        echo "FAILURE: mock-http did not become ready" >&2
        docker logs "$mock_cid" 2>&1 | tail -20 >&2
        exit 1
    fi
    mock_started=true
}

input_event_files=$(ls "$integration_tests_dir/input_events")
# Sort event files by name so that snapshots stay consistent
input_event_files=($(for file_name in ${input_event_files[@]}; do echo $file_name; done | sort))

set +e # Don't exit this script if an invocation fails or there's a diff

function lambda_node_image_tag() {
    if [ "$1" = "26" ]; then
        echo "26-preview.2026.08.21.22"
    else
        echo "$1"
    fi
}

function compare_snapshot() {
    local actual=$1
    local snapshot_path=$2
    local description=$3
    local sort_lines=${4:-false}
    local diff_output
    local diff_status

    if [ "$sort_lines" = true ]; then
        # Preserve normalized whitespace; normalize.sh removes RIE's REPORT tab.
        diff_output=$(printf '%s\n' "$actual" | LC_ALL=C sort | diff - <(LC_ALL=C sort "$snapshot_path"))
    else
        diff_output=$(printf '%s\n' "$actual" | diff - "$snapshot_path")
    fi
    diff_status=$?

    case "$diff_status" in
        0)
            echo "Ok: $description matches snapshot"
            ;;
        1)
            echo "Failed: $description does not match snapshot:"
            echo "$diff_output"
            mismatch_found=true
            ;;
        *)
            echo "FAILURE: diff failed for $description (exit $diff_status):" >&2
            echo "$diff_output" >&2
            mismatch_found=true
            ;;
    esac
}

# Write a golden in update mode.
#
# A shared golden is written by every leg, so each leg after the first must
# agree with what is already there. If one diverges, the sharing assumption is
# wrong for that case and we say so, rather than letting the last leg to run
# silently overwrite the others.
function write_snapshot() {
    local actual=$1
    local snapshot_path=$2
    local description=$3
    local shared=${4:-false}
    local sort_lines=${5:-false}
    local agree

    if [ "$shared" = true ] && [ -f "$snapshot_path" ]; then
        # Agreement must use the same semantics as compare_snapshot. Log lines
        # are compared sorted because RIE's platform logging races with
        # application output, so RTDONE can land on either side of a nearby
        # line; that is ordering noise, not a divergence between runtimes.
        if [ "$sort_lines" = true ]; then
            printf '%s\n' "$actual" | LC_ALL=C sort | diff -q - <(LC_ALL=C sort "$snapshot_path") >/dev/null
            agree=$?
        else
            [ "$(printf '%s\n' "$actual")" = "$(cat "$snapshot_path")" ]
            agree=$?
        fi
        if [ "$agree" -ne 0 ]; then
            echo "FAILURE: $description diverges from shared golden $snapshot_path" >&2
            echo "  Shared goldens require every leg to agree. Express a real" >&2
            echo "  divergence by adding a case-specific override file, not by" >&2
            echo "  overwriting the shared one." >&2
            printf '%s\n' "$actual" | diff - "$snapshot_path" >&2
            mismatch_found=true
            return
        fi
        echo "Ok: $description already matches shared golden $snapshot_path"
        return
    fi

    echo "Writing $description to $snapshot_path"
    printf '%s\n' "$actual" >"$snapshot_path"
}

for node_version in "${RUNTIMES[@]}"; do
    node_image_tag=$(lambda_node_image_tag "$node_version")
    # In the dd-trace v6 world the container fixtures take a DD_TRACE_VERSION
    # build-arg (fixture package.json pins the newest line, which older
    # runtimes cannot install). Pin the fixture to the tracer line that
    # actually supports this runtime. On the v5 world there is no
    # dd_trace_versions.sh and the fixture Dockerfiles declare no such ARG;
    # docker only warns about the unused build-arg, so this stays harmless.
    dd_trace_build_version=""
    if [ -f "$repo_dir/scripts/dd_trace_versions.sh" ]; then
        . "$repo_dir/scripts/dd_trace_versions.sh"
        dd_trace_build_version=$(dd_trace_version_for_node_major "$node_version")
    fi
    for case_name in "${CASES[@]}"; do
        configure_case "$case_name" || exit 1
        handler_name="$case_name"
        image_tag="datadog-lambda-js-local-test:${case_image}-node${node_version}"
        # AWS_LAMBDA_FUNCTION_NAME deliberately carries no runtime major. It
        # propagates into service, resource, resource_names, functionname,
        # function_arn, _dd.base_service and _dd.tags.process, so embedding the
        # runtime here made every runtime's golden differ in ~100 lines of pure
        # fixture naming, which buried the one line that is actually
        # runtime-specific.
        function_name="integration-tests-js-local-${handler_name}"

        echo ""
        echo "=== Case $case_name (image $case_image, runtime nodejs${node_version}.x) ==="

        if [ "$case_image" = "layer" ]; then
            prepare_layer_context
        fi

        echo "=== Building $image_tag from Lambda Node image $node_image_tag (platform $PLATFORM) ==="
        docker build --platform "$PLATFORM" \
            --build-arg NODE_VERSION="$node_image_tag" \
            --build-arg DD_TRACE_VERSION="$dd_trace_build_version" \
            -t "$image_tag" \
            "$integration_tests_dir/container/$case_image" || exit 1

        mock_network_args=()
        if [ "$case_needs_mock" = true ]; then
            start_mock "public.ecr.aws/lambda/nodejs:${node_image_tag}"
            mock_network_args=(--network "$mock_network")
        fi

        echo "=== Starting $function_name under RIE ==="
        cid=$(docker run -d --rm --platform "$PLATFORM" \
            -p 127.0.0.1::8080 \
            -v "$local_dir/bin:/aws-lambda-rie" \
            --entrypoint /aws-lambda-rie/aws-lambda-rie \
            -e DD_API_KEY=local-test \
            -e DD_SITE=datadoghq.com \
            -e DD_FLUSH_TO_LOG=true \
            -e DD_INTEGRATION_TEST=true \
            -e DD_COLD_START_TRACING=false \
            -e DD_SERVICE_MAPPING="lambda_api_gateway:remappedApiGatewayServiceName,lambda_sns:remappedSnsServiceName,lambda_sqs:remappedSqsServiceName,lambda_s3:remappedS3ServiceName,lambda_eventbridge:remappedEventBridgeServiceName,lambda_kinesis:remappedKinesisServiceName,lambda_dynamodb:remappedDynamoDbServiceName,lambda_url:remappedUrlServiceName" \
            -e AWS_LAMBDA_FUNCTION_NAME="$function_name" \
            -e AWS_REGION=eu-west-1 \
            ${DD_DEBUG:+-e DD_DEBUG="$DD_DEBUG"} \
            "${case_extra_env[@]}" \
            "${mock_network_args[@]}" \
            "$image_tag" \
            /lambda-entrypoint.sh "$case_entry_handler")
        container_ids+=("$cid")

        port=$(docker port "$cid" 8080 | head -1 | sed 's/.*://')
        echo "Container $cid listening on port $port"

        # Wait for RIE to answer HTTP. NOTE: we must NOT probe with a POST to
        # the invocations endpoint — that would consume the cold-start first
        # invocation (and break the proactive-initialization simulation, which
        # keys off init->first-invoke delay). A bare TCP connect is NOT
        # sufficient either: the Docker Desktop port proxy accepts connections
        # before the in-container server is reachable and then drops the next
        # real request ("empty reply from server"). A GET to / is answered by
        # RIE with 404 without touching the invocation pipeline, so curl's
        # exit status proves the whole proxy + HTTP path.
        ready=false
        for i in $(seq 1 60); do
            if curl -s -o /dev/null --max-time 2 "http://localhost:$port/"; then
                ready=true
                break
            fi
            sleep 0.5
        done
        if [ "$ready" != true ]; then
            echo "FAILURE: $function_name did not become ready. Container logs:"
            docker logs "$cid" 2>&1 | tail -30
            mismatch_found=true
            docker rm -f "$cid" >/dev/null 2>&1
            container_ids=("${container_ids[@]/$cid}")
            continue
        fi

        if [ "$case_proactive" = true ]; then
            echo "Sleeping 15s to simulate proactive initialization..."
            sleep 15
        fi

        echo "=== Invoking $function_name with input events ==="
        for input_event_file in "${input_event_files[@]}"; do
            input_event_name=$(echo "$input_event_file" | sed "s/.json//")
            # curl does not fail on HTTP errors, so validate the response status.
            invoke_response=$(curl -s -w '\n%{http_code}' -XPOST \
                "http://localhost:$port/2015-03-31/functions/function/invocations" \
                -d @"$integration_tests_dir/input_events/$input_event_file")
            invoke_success=$?
            http_code=$(printf '%s\n' "$invoke_response" | tail -n1)
            return_value=$(printf '%s\n' "$invoke_response" | sed '$d')
            if [ $invoke_success -ne 0 ]; then
                echo "FAILURE: Invocation transport error (curl exit $invoke_success) for $handler_name with $input_event_name" >&2
                mismatch_found=true
                continue
            fi
            # RIE answers a failed invocation like the Lambda Invoke API does:
            # HTTP 200 with the serialized error as the body. "Expected"
            # failures are pinned per case via the return-value golden; a
            # non-200 is always a transport-level problem.
            if [ "$http_code" != "200" ]; then
                echo "FAILURE: Invocation returned HTTP $http_code for $handler_name with $input_event_name" >&2
                echo "  body: $return_value" >&2
                mismatch_found=true
                continue
            fi
            if [ -n "$case_return_filter" ]; then
                return_value=$(printf '%s\n' "$return_value" | sed -E "$case_return_filter")
            fi
            if [ "$case_expect_error" = true ]; then
                if ! printf '%s\n' "$return_value" | grep -q '"errorMessage"'; then
                    echo "Failed: expected an error body for $handler_name with $input_event_name, got: $return_value"
                    mismatch_found=true
                    continue
                fi
            fi
            echo "  $input_event_name -> $return_value"

            # Return-value goldens resolve from most to least specific; the
            # first file that exists wins. Adding a more specific file is
            # visible in review where loosening a comparison is not.
            # Case-level and default goldens are shared: every runtime leg
            # must agree with them (enforced by write_snapshot in update
            # mode). Per-event and per-runtime files express a real, reviewed
            # divergence for that case, so they are simply overwritten.
            return_snapshot=""
            return_shared=false
            for candidate in \
                "$local_dir/snapshots/return_values/${case_name}_node${node_version}_${input_event_name}.json" \
                "$local_dir/snapshots/return_values/${case_name}_${input_event_name}.json" \
                "$local_dir/snapshots/return_values/${case_name}_node${node_version}.json"; do
                if [ -f "$candidate" ]; then
                    return_snapshot=$candidate
                    break
                fi
            done
            if [ -z "$return_snapshot" ]; then
                return_shared=true
                case "$case_return_mode" in
                    case)
                        # Same payload for every event (e.g. an error body).
                        return_snapshot="$local_dir/snapshots/return_values/${case_name}.json"
                        ;;
                    per-event)
                        # Payload embeds event data (record ids, request ids),
                        # so each event gets its own shared golden.
                        return_snapshot="$local_dir/snapshots/return_values/${case_name}_${input_event_name}.json"
                        ;;
                    *)
                        # Every runtime, case and input event returns the same
                        # fixture response, so one shared golden carries the
                        # whole assertion.
                        return_snapshot="$local_dir/snapshots/return_values/default.json"
                        ;;
                esac
                # An existing case-level file still wins over the mode target.
                if [ "$case_return_mode" != "case" ] && [ -f "$local_dir/snapshots/return_values/${case_name}.json" ]; then
                    return_snapshot="$local_dir/snapshots/return_values/${case_name}.json"
                fi
            fi

            if [ "$update_snapshots" = true ]; then
                write_snapshot "$return_value" "$return_snapshot" \
                    "Return value for $handler_name with $input_event_name" \
                    "$return_shared"
            elif [ ! -f "$return_snapshot" ]; then
                echo "Failed: Missing return-value snapshot: $return_snapshot"
                mismatch_found=true
            else
                compare_snapshot "$return_value" "$return_snapshot" \
                    "Return value for $handler_name with $input_event_name"
            fi
        done

        # Wait for both completion markers; RIE may emit RTDONE after REPORT.
        # The managed-instances path used by the proactive-init case emits
        # REPORT but never RTDONE, so requiring it there would always time out.
        expected_invocation_count=${#input_event_files[@]}
        if [ "$case_proactive" = true ]; then
            expected_rtdone_count=0
        else
            expected_rtdone_count=$expected_invocation_count
        fi
        logs_ready=false
        raw_logs=""
        for i in $(seq 1 40); do
            raw_logs=$(docker logs "$cid" 2>&1)
            report_count=$(printf '%s\n' "$raw_logs" | grep -c '^REPORT RequestId:' || true)
            rtdone_count=$(printf '%s\n' "$raw_logs" | grep -c 'INVOKE RTDONE' || true)
            if [ "$report_count" -ge "$expected_invocation_count" ] && \
                [ "$rtdone_count" -ge "$expected_rtdone_count" ]; then
                logs_ready=true
                break
            fi
            sleep 0.25
        done
        if [ "$logs_ready" != true ]; then
            echo "FAILURE: Timed out waiting for $expected_invocation_count REPORT and $expected_rtdone_count RTDONE markers from $function_name; found $report_count/$rtdone_count" >&2
            printf '%s\n' "$raw_logs" > "/tmp/l2-raw-${case_name}-node${node_version}.log"
            echo "Full raw logs written to /tmp/l2-raw-${case_name}-node${node_version}.log" >&2
            echo "$raw_logs" | tail -30 >&2
            mismatch_found=true
            docker rm -f "$cid" >/dev/null 2>&1
            container_ids=("${container_ids[@]/$cid}")
            continue
        fi

        # Proactive initialization is platform scheduling, so normalize.sh
        # drops the markers. For the dedicated case we assert them against the
        # raw log before normalization, which keeps the coverage without
        # weakening the shared pipeline.
        if [ "$case_proactive" = true ]; then
            for marker in '"proactive_initialization":1' 'proactive_initialization:true' 'cold_start:false'; do
                if printf '%s\n' "$raw_logs" | grep -qF "$marker"; then
                    echo "Ok: proactive-init marker $marker present for $function_name"
                else
                    echo "Failed: expected proactive-init marker $marker in raw logs for $function_name"
                    mismatch_found=true
                fi
            done
        fi

        logs=$(printf '%s\n' "$raw_logs" | "$local_dir/normalize.sh")

        # `runtime:nodejsNN.x` is the only genuinely runtime-specific line in
        # the whole log — everything else is identical across 18/20/22/24/26.
        # Assert it explicitly, then collapse it so one golden serves every
        # runtime. Without this assertion, sharing the golden would silently
        # stop checking that the library reports the runtime it is actually
        # running on. The aws.lambda.enhanced.invocations record of every
        # invocation carries the tag, so the count must be at least the
        # invocation count; extra records (e.g. enhanced.errors on the
        # erroring cases) only add more, and their exact content is pinned by
        # the log golden itself.
        runtime_tag_count=$(printf '%s\n' "$logs" | grep -c "runtime:nodejs${node_version}\.x" || true)
        if [ "$runtime_tag_count" -lt "$expected_invocation_count" ]; then
            echo "Failed: expected at least $expected_invocation_count runtime:nodejs${node_version}.x tags for $function_name, found $runtime_tag_count"
            mismatch_found=true
        else
            echo "Ok: $function_name tagged runtime:nodejs${node_version}.x on all $expected_invocation_count invocations"
        fi
        logs=$(printf '%s\n' "$logs" | sed -E 's/runtime:nodejs[0-9]+\.x/runtime:nodejsXX.x/g')

        # Same assert-then-collapse for the dd_lambda_layer tag (emitted by the
        # manual-wrap cases): the node major in the tag must match the runtime
        # under test. normalize.sh already collapses minor/patch to XX.X;
        # after this guard passes, the major collapses to XX as well, so the
        # shared golden reads datadog-nodevXX.XX.X.
        layer_majors=$(printf '%s\n' "$logs" | grep -o 'dd_lambda_layer:datadog-nodev[0-9]*' | sed 's/.*datadog-nodev//' | sort -u || true)
        if [ -n "$layer_majors" ]; then
            if [ "$layer_majors" != "$node_version" ]; then
                echo "Failed: dd_lambda_layer tag reports nodev$layer_majors but runtime is node$node_version for $function_name"
                mismatch_found=true
            else
                echo "Ok: $function_name dd_lambda_layer tag reports nodev$node_version"
            fi
            logs=$(printf '%s\n' "$logs" | sed -E 's/dd_lambda_layer:datadog-nodev[0-9]+\./dd_lambda_layer:datadog-nodevXX./g')
        fi

        docker rm -f "$cid" >/dev/null 2>&1
        container_ids=("${container_ids[@]/$cid}")

        # Shared per case, with a per-runtime override for real divergence.
        runtime_log_snapshot="$local_dir/snapshots/logs/${case_name}_node${node_version}.log"
        if [ -f "$runtime_log_snapshot" ]; then
            log_snapshot=$runtime_log_snapshot
            log_shared=false
        else
            log_snapshot="$local_dir/snapshots/logs/${case_name}.log"
            log_shared=true
        fi

        if [ "$update_snapshots" = true ]; then
            write_snapshot "$logs" "$log_snapshot" "Logs for $function_name" "$log_shared" true
        elif [ ! -f "$log_snapshot" ]; then
            echo "Failed: Missing log snapshot: $log_snapshot"
            mismatch_found=true
        else
            compare_snapshot "$logs" "$log_snapshot" "Logs for $function_name" true
        fi
    done
done

set -e

if [ "$mismatch_found" = true ]; then
    echo "FAILURE: A mismatch between new data and a snapshot was found and printed above."
    echo "If the change is expected, generate new snapshots by running 'UPDATE_SNAPSHOTS=true ./integration_tests_local/run.sh'"
    exit 1
fi

if [ "$update_snapshots" = true ]; then
    echo "SUCCESS: Wrote new snapshots"
    exit 0
fi

echo "SUCCESS: No difference found between snapshots and new return values or logs"
