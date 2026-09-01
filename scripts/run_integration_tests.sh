#!/bin/bash

# Usage - run commands from repo root:
# To check if new changes to the layer cause changes to any snapshots:
#   BUILD_LAYERS=true DD_API_KEY=XXXX aws-vault exec sso-serverless-sandbox-account-admin -- ./scripts/run_integration_tests.sh
# To regenerate snapshots:
#   BUILD_LAYERS=true UPDATE_SNAPSHOTS=true DD_API_KEY=XXXX aws-vault exec sso-serverless-sandbox-account-admin -- ./scripts/run_integration_tests.sh
# To skip invoking/snapshotting the container-image handlers (they are still
# deployed, so Docker and ECR push access are still required):
#   BUILD_LAYERS=true UPDATE_SNAPSHOTS=true SKIP_CONTAINER_TESTS=true DD_API_KEY=XXXX aws-vault exec sso-serverless-sandbox-account-admin -- ./scripts/run_integration_tests.sh
# To run a single runtime:
#   RUNTIME_PARAM=26 BUILD_LAYERS=true UPDATE_SNAPSHOTS=true DD_API_KEY=XXXX aws-vault exec sso-serverless-sandbox-account-admin -- ./scripts/run_integration_tests.sh
#
# Requires Docker for the container-image handlers. Uses the Serverless CLI
# pinned globally in .gitlab/Dockerfile.

set -e

# AWS Lambda only accepts Docker v2 image manifests, not the OCI manifests that
# buildx produces by default (with provenance attestations). Disabling default
# attestations makes buildx emit Docker v2 manifests, which Lambda will accept
# as the source image for the container-* test functions.
export BUILDX_NO_DEFAULT_ATTESTATIONS=1

# These values need to be in sync with serverless.yml, where there needs to be a function
# defined for every handler_runtime combination.
ALL_LAMBDA_HANDLERS=("async-metrics" "esm" "sync-metrics" "http-requests" "process-input-traced" "throw-error-traced" "status-code-500s" "container-cjs" "container-esm")
ZIP_LAMBDA_HANDLERS=("async-metrics" "esm" "sync-metrics" "http-requests" "process-input-traced" "throw-error-traced" "status-code-500s")

LOG_FETCH_ATTEMPTS=10
LOG_FETCH_INTERVAL_SECONDS=10

scripts_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(dirname "$scripts_dir")
cwd=$(pwd)

integration_tests_dir="$repo_dir/integration_tests"

# shellcheck source=scripts/wait_for_complete_logs.sh
source "$scripts_dir/wait_for_complete_logs.sh"

script_utc_start_time=$(date -u +"%Y%m%dT%H%M%S")

mismatch_found=false

# Format :
# [0]: serverless runtime name
# [1]: nodejs version
# [2]: random 8-character ID to avoid collisions with other runs
node18=("nodejs18.x" "18.12" $(xxd -l 4 -c 4 -p < /dev/random))
node20=("nodejs20.x" "20.19" $(xxd -l 4 -c 4 -p < /dev/random))
node22=("nodejs22.x" "22.11" $(xxd -l 4 -c 4 -p < /dev/random))
node24=("nodejs24.x" "24.11" $(xxd -l 4 -c 4 -p < /dev/random))
node26=("nodejs26.x" "26.1" $(xxd -l 4 -c 4 -p < /dev/random))

PARAMETERS_SETS=("node18" "node20" "node22" "node24" "node26")

if [ -z "$RUNTIME_PARAM" ]; then
    echo "Node version not specified, running for all node versions."
else
    echo "Node version is specified: $RUNTIME_PARAM"
    PARAMETERS_SETS=(node${RUNTIME_PARAM})
    BUILD_LAYER_VERSION=node$RUNTIME_PARAM[1]
fi

if [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "No AWS credentials were found in the environment."
    echo "Note that only Datadog employees can run these integration tests."
    exit 1
fi

if [ -z "$DD_API_KEY" ]; then
    echo "No DD_API_KEY env var set, exiting"
    exit 1
fi

if [ -n "$UPDATE_SNAPSHOTS" ]; then
    echo "Overwriting snapshots in this execution"
fi

if [ -n "$SKIP_CONTAINER_TESTS" ]; then
    LAMBDA_HANDLERS=("${ZIP_LAMBDA_HANDLERS[@]}")
    echo "Skipping invocation and snapshotting of the container-image handlers"
else
    LAMBDA_HANDLERS=("${ALL_LAMBDA_HANDLERS[@]}")
fi

if [ -n "$BUILD_LAYERS" ]; then
    echo "Building layers that will be deployed with our test functions"
    if [ -n "$BUILD_LAYER_VERSION" ]; then
        NODE_VERSION=${!BUILD_LAYER_VERSION} source $scripts_dir/build_layers.sh
    else
        source $scripts_dir/build_layers.sh
    fi
else
    echo "Not building layers, ensure they've already been built or re-run with 'BUILD_LAYERS=true DD_API_KEY=XXXX ./scripts/run_integration_tests.sh'"
fi

# Build and pack the locally-modified datadog-lambda-js so the container-image
# tests install the version under test (not the published one) via npm.
echo "Packing local datadog-lambda-js for container tests"
cd $repo_dir
# Ensure root-level devDeps (TypeScript, @types/*) are installed before tsc.
# In CI the script is typically invoked without BUILD_LAYERS=true, so the
# Docker-internal yarn install that path would do isn't reached, and the host
# repo would otherwise tsc against an empty node_modules.
yarn install --frozen-lockfile
yarn build
npm pack
mv datadog-lambda-js-*.tgz $integration_tests_dir/container/cjs/datadog-lambda-js-local.tgz
cp $integration_tests_dir/container/cjs/datadog-lambda-js-local.tgz \
   $integration_tests_dir/container/esm/datadog-lambda-js-local.tgz

cd $integration_tests_dir
yarn

function run_serverless() {
    NODE_VERSION=${!nodejs_version} NODE_MAJOR=$(lambda_node_image_tag $parameters_set) RUNTIME=$parameters_set SERVERLESS_RUNTIME=${!serverless_runtime} \
        serverless "$@"
}

input_event_files=$(ls ./input_events)
# Sort event files by name so that snapshots stay consistent
input_event_files=($(for file_name in ${input_event_files[@]}; do echo $file_name; done | sort))

# ECR tag for public.ecr.aws/lambda/nodejs used by container-{cjs,esm} tests.
# Node 26 is preview-only on ECR until GA; plain :26 does not exist yet.
function lambda_node_image_tag() {
    local node_major="${1#node}"
    if [ "$node_major" = "26" ]; then
        echo "26-preview-x86_64"
    else
        echo "$node_major"
    fi
}

# Always remove the stacks before exiting, no matter what
function remove_stack() {
    for parameters_set in "${PARAMETERS_SETS[@]}"; do
        serverless_runtime=$parameters_set[0]
        nodejs_version=$parameters_set[1]
        run_id=$parameters_set[2]
        echo "Removing stack for stage : ${!run_id}"
        run_serverless remove --stage ${!run_id}
    done
}

 trap remove_stack EXIT

for parameters_set in "${PARAMETERS_SETS[@]}"; do

    serverless_runtime=$parameters_set[0]
    nodejs_version=$parameters_set[1]
    run_id=$parameters_set[2]

    echo "Deploying functions for runtime : $parameters_set, serverless runtime : ${!serverless_runtime}, \
nodejs version : ${!nodejs_version} and run id : ${!run_id}"

    run_serverless deploy --stage ${!run_id}

    echo "Invoking functions for runtime $parameters_set"
    set +e # Don't exit this script if an invocation fails or there's a diff
    for input_event_file in "${input_event_files[@]}"; do
        for handler_name in "${LAMBDA_HANDLERS[@]}"; do

            function_name="${handler_name}_node"

            echo "$function_name"
            # Get event name without trailing ".json" so we can build the snapshot file name
            input_event_name=$(echo "$input_event_file" | sed "s/.json//")
            # Return value snapshot file format is snapshots/return_values/{handler}_{runtime}_{input-event}
            snapshot_path="./snapshots/return_values/${handler_name}_${parameters_set}_${input_event_name}.json"
            function_failed=FALSE

            return_value=$(run_serverless invoke --stage ${!run_id} -f "$function_name" --path "./input_events/$input_event_file")
            invoke_success=$?
            if [ $invoke_success -ne 0 ]; then
                return_value="Invocation failed"
            fi

            if [ ! -f $snapshot_path ]; then
                # If the snapshot file doesn't exist yet, we create it
                echo "Writing return value to $snapshot_path because no snapshot exists yet"
                echo "$return_value" >$snapshot_path
            elif [ -n "$UPDATE_SNAPSHOTS" ]; then
                # If $UPDATE_SNAPSHOTS is set to true, write the new logs over the current snapshot
                echo "Overwriting return value snapshot for $snapshot_path"
                echo "$return_value" >$snapshot_path
            else
                # Compare new return value to snapshot
                diff_output=$(echo "$return_value" | diff - $snapshot_path)
                if [ $? -eq 1 ]; then
                    echo "Failed: Return value for $function_name does not match snapshot:"
                    echo "$diff_output"
                    mismatch_found=true
                else
                    echo "Ok: Return value for $function_name with $input_event_name event matches snapshot"
                fi
            fi
        done
    done
done
set +e # Don't exit this script if there is a diff or the logs endpoint fails
echo "Fetching logs for invocations and comparing to snapshots"
expected_completion_count=${#input_event_files[@]}
for handler_name in "${LAMBDA_HANDLERS[@]}"; do
    for parameters_set in "${PARAMETERS_SETS[@]}"; do
        function_name="${handler_name}_node"
        function_snapshot_path="./snapshots/logs/${handler_name}_${parameters_set}.log"
        serverless_runtime=$parameters_set[0]
        nodejs_version=$parameters_set[1]
        run_id=$parameters_set[2]
        if ! raw_logs=$(wait_for_complete_logs \
            "$expected_completion_count" \
            "$LOG_FETCH_ATTEMPTS" \
            "$LOG_FETCH_INTERVAL_SECONDS" \
            run_serverless logs --stage "${!run_id}" -f "$function_name" --startTime "$script_utc_start_time"); then
            mismatch_found=true
            continue
        fi

        if ! logs=$(printf '%s\n' "$raw_logs" | \
            RUN_ID="${!run_id}" "$scripts_dir/normalize_integration_logs.sh" aws); then
            echo "FAILURE: Could not normalize logs for $function_name" >&2
            mismatch_found=true
            continue
        fi

        if [ ! -f "$function_snapshot_path" ]; then
            # If no snapshot file exists yet, we create one
            echo "Writing logs to $function_snapshot_path because no snapshot exists yet"
            printf '%s\n' "$logs" > "$function_snapshot_path"
        else
            if ! normalized_snapshot=$(RUN_ID="${!run_id}" \
                "$scripts_dir/normalize_integration_logs.sh" aws formatted < "$function_snapshot_path"); then
                echo "FAILURE: Could not normalize snapshot for $function_name" >&2
                mismatch_found=true
                continue
            fi
            # Compare new logs to snapshots
            diff_output=$(printf '%s\n' "$logs" | sort | diff -w - <(printf '%s\n' "$normalized_snapshot" | sort))
            if [ $? -eq 1 ]; then
                if [ -n "$UPDATE_SNAPSHOTS" ]; then
                    # If $UPDATE_SNAPSHOTS is set to true write the new logs over the current snapshot
                    echo "Overwriting log snapshot for $function_snapshot_path"
                    printf '%s\n' "$logs" > "$function_snapshot_path"
                else
                    echo "Failed: Mismatch found between new $function_name logs (first) and snapshot (second):"
                    echo "$diff_output"
                    mismatch_found=true
                fi
            else
                echo "Ok: New logs for $function_name match snapshot"
            fi
        fi
    done
done
set -e

if [ "$mismatch_found" = true ]; then
    echo "FAILURE: A mismatch between new data and a snapshot was found and printed above."
    echo "If the change is expected, generate new snapshots by running:"
    echo "  BUILD_LAYERS=true UPDATE_SNAPSHOTS=true DD_API_KEY=XXXX aws-vault exec sso-serverless-sandbox-account-admin -- ./scripts/run_integration_tests.sh"
    echo "To update only the zip/layer snapshots, add SKIP_CONTAINER_TESTS=true."
    exit 1
fi

if [ -n "$UPDATE_SNAPSHOTS" ]; then
    echo "SUCCESS: Wrote new snapshots for all functions"
    exit 0
fi

echo "SUCCESS: No difference found between snapshots and new return values or logs"
