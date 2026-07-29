#!/bin/bash

# Local (docker-based) integration tests for datadog-lambda-js.
#
# Runs the container-image handler variants (container/cjs, container/esm)
# against the AWS Runtime Interface Emulator (RIE) — no AWS account needed.
# Logs are captured from `docker logs`, normalized with the SAME pipeline as
# scripts/run_integration_tests.sh (see ./normalize.sh), and diffed against
# LOCAL snapshots in ./snapshots/ (not integration_tests/snapshots/).
#
# Usage (from repo root or this directory):
#   ./integration_tests_local/run.sh                 # all runtimes, both variants
#   RUNTIME_PARAM=18 ./integration_tests_local/run.sh
#   RUNTIME_PARAM=18 VARIANT_PARAM=esm ./integration_tests_local/run.sh
#   UPDATE_SNAPSHOTS=true ./integration_tests_local/run.sh
#   SIMULATE_PROACTIVE_INIT=true RUNTIME_PARAM=18 VARIANT_PARAM=esm ./integration_tests_local/run.sh
#
# Env knobs:
#   RUNTIME_PARAM            - node major version: 18|20|22|24 (default: all)
#   VARIANT_PARAM            - container variant: cjs|esm (default: both)
#   PLATFORM                 - docker platform (default: linux/arm64)
#   UPDATE_SNAPSHOTS=true    - overwrite local snapshots instead of diffing
#   SIMULATE_PROACTIVE_INIT=true - force the init phase to run eagerly at
#                              container start (via AWS_LAMBDA_MAX_CONCURRENCY=1,
#                              switching RIE to its managed-instances path), then
#                              sleep 15s before the first invocation. This
#                              replicates AWS proactive initialization (>10s
#                              sandbox init -> first invoke), which makes the
#                              library emit proactive_initialization span/metric
#                              tags. (A sleep alone is NOT enough: the classic
#                              RIE defers init to the first invocation.)
#   SKIP_PACK=true           - reuse existing container/*/datadog-lambda-js-local.tgz

set -e

script_path=${BASH_SOURCE[0]}
local_dir=$(cd "$(dirname "$script_path")" && pwd)
repo_dir=$(dirname "$local_dir")
integration_tests_dir="$repo_dir/integration_tests"

PLATFORM=${PLATFORM:-linux/arm64}
case "$PLATFORM" in
    linux/arm64) RIE_ASSET=aws-lambda-rie-arm64 ;;
    linux/amd64) RIE_ASSET=aws-lambda-rie-x86_64 ;;
    *) echo "Unsupported PLATFORM: $PLATFORM (use linux/arm64 or linux/amd64)"; exit 1 ;;
esac

RUNTIMES=("18" "20" "22" "24")
if [ -n "$RUNTIME_PARAM" ]; then
    echo "Node version is specified: $RUNTIME_PARAM"
    RUNTIMES=("$RUNTIME_PARAM")
else
    echo "Node version not specified, running for all node versions."
fi

VARIANTS=("cjs" "esm")
if [ -n "$VARIANT_PARAM" ]; then
    echo "Variant is specified: $VARIANT_PARAM"
    VARIANTS=("$VARIANT_PARAM")
fi

if [ -n "$UPDATE_SNAPSHOTS" ]; then
    echo "Overwriting snapshots in this execution"
fi
extra_docker_env=()
if [ -n "$SIMULATE_PROACTIVE_INIT" ]; then
    echo "SIMULATE_PROACTIVE_INIT: eager init + 15s sleep between container start and first invocation"
    # The classic RIE runs the init phase (wrapper module load, which stamps
    # initTime) lazily on the first invocation, so a post-start sleep alone
    # creates no init->invoke gap. Setting AWS_LAMBDA_MAX_CONCURRENCY switches
    # the same RIE binary into its managed-instances path, which inits EAGERLY
    # at container start; the 15s sleep then replicates AWS proactive
    # initialization. The only library-visible side effect is
    # AWS_LAMBDA_INITIALIZATION_TYPE=lambda-managed-instances, which solely
    # gates cold-start tracing spans (already disabled via
    # DD_COLD_START_TRACING=false). AWS_LAMBDA_LOG_FORMAT=text keeps the
    # runtime log format identical to the classic path.
    extra_docker_env=(-e AWS_LAMBDA_MAX_CONCURRENCY=1 -e AWS_LAMBDA_LOG_FORMAT=text)
fi

mismatch_found=false
container_ids=()

function cleanup() {
    for cid in "${container_ids[@]}"; do
        docker rm -f "$cid" >/dev/null 2>&1 || true
    done
}
trap cleanup EXIT

# Download the RIE binary once into ./bin (gitignored).
rie_binary="$local_dir/bin/aws-lambda-rie"
if [ ! -f "$rie_binary" ]; then
    echo "Downloading AWS Runtime Interface Emulator ($RIE_ASSET)"
    curl -fSL -o "$rie_binary" \
        "https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/latest/download/$RIE_ASSET"
    chmod +x "$rie_binary"
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

for node_version in "${RUNTIMES[@]}"; do
    for variant in "${VARIANTS[@]}"; do
        handler_name="container-${variant}"
        image_tag="datadog-lambda-js-local-test:${handler_name}-node${node_version}"
        function_name="integration-tests-js-local-${handler_name}_node${node_version}"

        echo ""
        echo "=== Building $image_tag (platform $PLATFORM) ==="
        docker build --platform "$PLATFORM" \
            --build-arg NODE_VERSION="$node_version" \
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

        if [ -n "$SIMULATE_PROACTIVE_INIT" ]; then
            echo "Sleeping 15s to simulate proactive initialization..."
            sleep 15
        fi

        echo "=== Invoking $function_name with input events ==="
        for input_event_file in "${input_event_files[@]}"; do
            input_event_name=$(echo "$input_event_file" | sed "s/.json//")
            return_value=$(curl -s -XPOST \
                "http://localhost:$port/2015-03-31/functions/function/invocations" \
                -d @"$integration_tests_dir/input_events/$input_event_file")
            invoke_success=$?
            if [ $invoke_success -ne 0 ]; then
                return_value="Invocation failed"
            fi
            echo "  $input_event_name -> $return_value"

            snapshot_path="$local_dir/snapshots/return_values/${handler_name}_node${node_version}_${input_event_name}.json"
            if [ ! -f "$snapshot_path" ]; then
                echo "$return_value" >"$snapshot_path"
            elif [ -n "$UPDATE_SNAPSHOTS" ]; then
                echo "$return_value" >"$snapshot_path"
            else
                diff_output=$(echo "$return_value" | diff - "$snapshot_path")
                if [ $? -eq 1 ]; then
                    echo "Failed: Return value for $handler_name with $input_event_name does not match snapshot:"
                    echo "$diff_output"
                    mismatch_found=true
                fi
            fi
        done

        # Give the library a moment to flush traces/metrics to stdout
        sleep 3

        function_snapshot_path="$local_dir/snapshots/logs/${handler_name}_node${node_version}.log"
        logs=$(docker logs "$cid" 2>&1 | "$local_dir/normalize.sh")

        docker rm -f "$cid" >/dev/null 2>&1
        container_ids=("${container_ids[@]/$cid}")

        if [ ! -f "$function_snapshot_path" ]; then
            echo "Writing logs to $function_snapshot_path because no snapshot exists yet"
            echo "$logs" >"$function_snapshot_path"
        elif [ -n "$UPDATE_SNAPSHOTS" ]; then
            echo "Overwriting log snapshot for $function_snapshot_path"
            echo "$logs" >"$function_snapshot_path"
        else
            diff_output=$(echo "$logs" | sort | diff -w - <(sort "$function_snapshot_path"))
            if [ $? -eq 1 ]; then
                echo "Failed: Mismatch found between new $function_name logs (first) and snapshot (second):"
                echo "$diff_output"
                mismatch_found=true
            else
                echo "Ok: New logs for $function_name match snapshot"
            fi
        fi
    done
done

set -e

if [ "$mismatch_found" = true ]; then
    echo "FAILURE: A mismatch between new data and a snapshot was found and printed above."
    echo "If the change is expected, generate new snapshots by running 'UPDATE_SNAPSHOTS=true ./integration_tests_local/run.sh'"
    exit 1
fi

if [ -n "$UPDATE_SNAPSHOTS" ]; then
    echo "SUCCESS: Wrote new snapshots"
    exit 0
fi

echo "SUCCESS: No difference found between snapshots and new return values or logs"
