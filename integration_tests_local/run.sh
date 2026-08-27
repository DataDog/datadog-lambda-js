#!/bin/bash

# Local (docker-based) integration tests for datadog-lambda-js.
#
# Runs the container-image handler variants (container/cjs, container/esm)
# against the AWS Runtime Interface Emulator (RIE) — no AWS account needed.
# Logs are captured from `docker logs`, normalized with the local pipeline in
# ./normalize.sh, and diffed against LOCAL snapshots in ./snapshots/ (not
# integration_tests/snapshots/).
#
# Usage (from repo root or this directory):
#   ./integration_tests_local/run.sh                 # all runtimes, both variants
#   RUNTIME_PARAM=18 ./integration_tests_local/run.sh
#   RUNTIME_PARAM=18 VARIANT_PARAM=esm ./integration_tests_local/run.sh
#   UPDATE_SNAPSHOTS=true ./integration_tests_local/run.sh
#   SIMULATE_PROACTIVE_INIT=true RUNTIME_PARAM=18 VARIANT_PARAM=esm ./integration_tests_local/run.sh
#
# Env knobs:
#   RUNTIME_PARAM            - node major version: 18|20|22|24|26 (default: all)
#   VARIANT_PARAM            - container variant: cjs|esm (default: both)
#   PLATFORM                 - docker platform (default: linux/arm64)
#   UPDATE_SNAPSHOTS=true    - overwrite local snapshots instead of diffing
#   SIMULATE_PROACTIVE_INIT=true - initialize eagerly, then wait 15s before invoke
#   SKIP_PACK=true           - reuse existing container/*/datadog-lambda-js-local.tgz

set -e

# Reject arguments; configuration is environment-only.
if [ "$#" -gt 0 ]; then
    echo "Unexpected argument: $1" >&2
    echo "This script takes no flags or positional arguments; use the env knobs, e.g." >&2
    echo "  RUNTIME_PARAM=18 VARIANT_PARAM=esm $0" >&2
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

SUPPORTED_VARIANTS=("cjs" "esm")
VARIANTS=("${SUPPORTED_VARIANTS[@]}")
if [ -n "${VARIANT_PARAM:-}" ]; then
    if ! contains "$VARIANT_PARAM" "${SUPPORTED_VARIANTS[@]}"; then
        echo "Unsupported VARIANT_PARAM: $VARIANT_PARAM (use cjs or esm)"
        exit 1
    fi
    echo "Variant is specified: $VARIANT_PARAM"
    VARIANTS=("$VARIANT_PARAM")
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
extra_docker_env=()
if [ -n "${SIMULATE_PROACTIVE_INIT:-}" ]; then
    echo "SIMULATE_PROACTIVE_INIT: eager init + 15s sleep between container start and first invocation"
    # Managed-instances mode initializes eagerly, so the delay creates the
    # init-to-invoke gap needed to simulate proactive initialization.
    extra_docker_env=(-e AWS_LAMBDA_MAX_CONCURRENCY=1 -e AWS_LAMBDA_LOG_FORMAT=text)
fi

mismatch_found=false
container_ids=()
rie_download=""

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
    yarn install --frozen-lockfile
    yarn build
    npm pack
    cp datadog-lambda-js-*.tgz "$integration_tests_dir/container/cjs/datadog-lambda-js-local.tgz"
    cp datadog-lambda-js-*.tgz "$integration_tests_dir/container/esm/datadog-lambda-js-local.tgz"
    rm -f datadog-lambda-js-*.tgz
else
    echo "SKIP_PACK: reusing existing container/*/datadog-lambda-js-local.tgz"
fi

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
    for variant in "${VARIANTS[@]}"; do
        handler_name="container-${variant}"
        image_tag="datadog-lambda-js-local-test:${handler_name}-node${node_version}"
        # AWS_LAMBDA_FUNCTION_NAME deliberately carries no runtime major. It
        # propagates into service, resource, resource_names, functionname,
        # function_arn, _dd.base_service and _dd.tags.process, so embedding the
        # runtime here made every runtime's golden differ in ~100 lines of pure
        # fixture naming, which buried the one line that is actually
        # runtime-specific.
        function_name="integration-tests-js-local-${handler_name}"
        node_image_tag=$(lambda_node_image_tag "$node_version")

        echo ""
        echo "=== Building $image_tag from Lambda Node image $node_image_tag (platform $PLATFORM) ==="
        docker build --platform "$PLATFORM" \
            --build-arg NODE_VERSION="$node_image_tag" \
            -t "$image_tag" \
            "$integration_tests_dir/container/$variant" || exit 1

        echo "=== Starting $function_name under RIE ==="
        cid=$(docker run -d --rm --platform "$PLATFORM" \
            -p 127.0.0.1::8080 \
            -v "$local_dir/bin:/aws-lambda-rie" \
            --entrypoint /aws-lambda-rie/aws-lambda-rie \
            -e DD_API_KEY=local-test \
            -e DD_SITE=datadoghq.com \
            -e DD_FLUSH_TO_LOG=true \
            -e DD_LAMBDA_HANDLER=handler.handle \
            -e DD_INTEGRATION_TEST=true \
            -e DD_COLD_START_TRACING=false \
            -e DD_SERVICE_MAPPING="lambda_api_gateway:remappedApiGatewayServiceName,lambda_sns:remappedSnsServiceName,lambda_sqs:remappedSqsServiceName,lambda_s3:remappedS3ServiceName,lambda_eventbridge:remappedEventBridgeServiceName,lambda_kinesis:remappedKinesisServiceName,lambda_dynamodb:remappedDynamoDbServiceName,lambda_url:remappedUrlServiceName" \
            -e AWS_LAMBDA_FUNCTION_NAME="$function_name" \
            -e AWS_REGION=eu-west-1 \
            ${DD_DEBUG:+-e DD_DEBUG="$DD_DEBUG"} \
            "${extra_docker_env[@]}" \
            "$image_tag" \
            /lambda-entrypoint.sh node_modules/datadog-lambda-js/dist/handler.handler)
        container_ids+=("$cid")

        port=$(docker port "$cid" 8080 | head -1 | sed 's/.*://')
        echo "Container $cid listening on port $port"

        # Wait for the RIE port to accept TCP connections. NOTE: we must NOT
        # probe with a POST to the invocations endpoint — that would consume
        # the cold-start first invocation (and break the proactive-
        # initialization simulation, which keys off init->first-invoke delay).
        ready=false
        for i in $(seq 1 60); do
            if (exec 3<>"/dev/tcp/localhost/$port") 2>/dev/null; then
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

        if [ -n "${SIMULATE_PROACTIVE_INIT:-}" ]; then
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
            http_code=$(printf '%s' "$invoke_response" | tail -n1)
            return_value=$(printf '%s' "$invoke_response" | sed '$d')
            if [ $invoke_success -ne 0 ]; then
                echo "FAILURE: Invocation transport error (curl exit $invoke_success) for $handler_name with $input_event_name" >&2
                mismatch_found=true
                continue
            fi
            if [ "$http_code" != "200" ]; then
                echo "FAILURE: Invocation returned HTTP $http_code for $handler_name with $input_event_name" >&2
                echo "  body: $return_value" >&2
                mismatch_found=true
                continue
            fi
            echo "  $input_event_name -> $return_value"

            # Every runtime, variant and input event returns the same fixture
            # response, so one shared golden carries the whole assertion. A
            # case-specific file wins when present: that is how an event which
            # legitimately returns something else gets expressed, and adding a
            # file is visible in review where loosening a comparison is not.
            case_return_snapshot="$local_dir/snapshots/return_values/${variant}_node${node_version}_${input_event_name}.json"
            if [ -f "$case_return_snapshot" ]; then
                return_snapshot=$case_return_snapshot
                return_shared=false
            else
                return_snapshot="$local_dir/snapshots/return_values/default.json"
                return_shared=true
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
        # The managed-instances path used by SIMULATE_PROACTIVE_INIT emits
        # REPORT but never RTDONE, so requiring it there would always time out.
        expected_invocation_count=${#input_event_files[@]}
        if [ -n "${SIMULATE_PROACTIVE_INIT:-}" ]; then
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
            echo "$raw_logs" | tail -30 >&2
            mismatch_found=true
            docker rm -f "$cid" >/dev/null 2>&1
            container_ids=("${container_ids[@]/$cid}")
            continue
        fi

        logs=$(printf '%s\n' "$raw_logs" | "$local_dir/normalize.sh")

        # `runtime:nodejsNN.x` is the only genuinely runtime-specific line in the
        # whole log — everything else is identical across 18/20/22/24/26. Assert
        # it explicitly, then collapse it so one golden serves every runtime.
        # Without this assertion, sharing the golden would silently stop checking
        # that the library reports the runtime it is actually running on.
        runtime_tag_count=$(printf '%s\n' "$logs" | grep -c "runtime:nodejs${node_version}\.x" || true)
        if [ "$runtime_tag_count" -ne "$expected_invocation_count" ]; then
            echo "Failed: expected $expected_invocation_count runtime:nodejs${node_version}.x tags for $function_name, found $runtime_tag_count"
            mismatch_found=true
        else
            echo "Ok: $function_name tagged runtime:nodejs${node_version}.x on all $expected_invocation_count invocations"
        fi
        logs=$(printf '%s\n' "$logs" | sed -E 's/runtime:nodejs[0-9]+\.x/runtime:nodejsXX.x/g')

        docker rm -f "$cid" >/dev/null 2>&1
        container_ids=("${container_ids[@]/$cid}")

        # Shared per variant, with a per-runtime override for real divergence.
        runtime_log_snapshot="$local_dir/snapshots/logs/${variant}_node${node_version}.log"
        if [ -f "$runtime_log_snapshot" ]; then
            log_snapshot=$runtime_log_snapshot
            log_shared=false
        else
            log_snapshot="$local_dir/snapshots/logs/${variant}.log"
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
