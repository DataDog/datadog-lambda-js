#!/bin/bash

# Usage - run commands from repo root:
# To check if new changes to the layer cause changes to any snapshots:
#   BUILD_LAYERS=true DD_API_KEY=XXXX aws-vault exec sso-serverless-sandbox-account-admin -- ./scripts/run_integration_tests.sh
# To regenerate snapshots:
#   BUILD_LAYERS=true UPDATE_SNAPSHOTS=true DD_API_KEY=XXXX aws-vault exec sso-serverless-sandbox-account-admin -- ./scripts/run_integration_tests.sh
# To update only zip/layer handler snapshots (skip ECR container-image deploys):
#   BUILD_LAYERS=true UPDATE_SNAPSHOTS=true SKIP_CONTAINER_TESTS=true DD_API_KEY=XXXX aws-vault exec sso-serverless-sandbox-account-admin -- ./scripts/run_integration_tests.sh
# To run a single runtime:
#   RUNTIME_PARAM=26 BUILD_LAYERS=true UPDATE_SNAPSHOTS=true DD_API_KEY=XXXX aws-vault exec sso-serverless-sandbox-account-admin -- ./scripts/run_integration_tests.sh
#
# Requires Docker when container-image handlers are enabled. Uses the pinned
# Serverless CLI from integration_tests/package.json (currently 3.39.0).

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

LOGS_WAIT_SECONDS=20
INTEGRATION_TEST_REGION="eu-west-1"
INTEGRATION_TEST_ACCOUNT_ID="425362996713"

script_path=${BASH_SOURCE[0]}
scripts_dir=$(dirname $script_path)
repo_dir=$(dirname $scripts_dir)
cwd=$(pwd)

integration_tests_dir="$repo_dir/integration_tests"

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
    echo "Node version is specified: ${RUNTIME_PARAM} (node${RUNTIME_PARAM})"
    PARAMETERS_SETS=("node${RUNTIME_PARAM}")
    BUILD_LAYER_VERSION="node${RUNTIME_PARAM}[1]"
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
    echo "Skipping container-image handlers (INTEGRATION_TEST_FUNCTIONS=zip-only)"
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

if [ -n "$SKIP_CONTAINER_TESTS" ]; then
    export INTEGRATION_TEST_FUNCTIONS=zip-only
else
    cat "$integration_tests_dir/functions/zip-only.yml" \
        "$integration_tests_dir/functions/container.yml" >"$integration_tests_dir/functions/all.yml"
    export INTEGRATION_TEST_FUNCTIONS=all
fi

# integration_tests/yarn.lock is gitignored; do not use --frozen-lockfile here or
# a stale local lockfile will skip installing serverless from package.json.
# CI image ships Node 18; serverless's AWS SDK deps declare engines >=20 but run fine.
yarn install --ignore-engines

function run_serverless() {
    NODE_VERSION=${!nodejs_version} NODE_MAJOR=$(lambda_node_image_tag $parameters_set) RUNTIME=$parameters_set SERVERLESS_RUNTIME=${!serverless_runtime} \
        yarn run --silent serverless "$@"
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

function ecr_docker_login() {
    echo "Logging Docker into ECR (${INTEGRATION_TEST_ACCOUNT_ID}, ${INTEGRATION_TEST_REGION})"
    aws ecr get-login-password --region "$INTEGRATION_TEST_REGION" |
        docker login --username AWS --password-stdin \
            "${INTEGRATION_TEST_ACCOUNT_ID}.dkr.ecr.${INTEGRATION_TEST_REGION}.amazonaws.com"
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

if [ "$INTEGRATION_TEST_FUNCTIONS" = "all" ]; then
    ecr_docker_login
fi

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
set -e

echo "Sleeping $LOGS_WAIT_SECONDS seconds to wait for logs to appear in CloudWatch..."
sleep $LOGS_WAIT_SECONDS

set +e # Don't exit this script if there is a diff or the logs endpoint fails
echo "Fetching logs for invocations and comparing to snapshots"
for handler_name in "${LAMBDA_HANDLERS[@]}"; do
    for parameters_set in "${PARAMETERS_SETS[@]}"; do
        function_name="${handler_name}_node"
        function_snapshot_path="./snapshots/logs/${handler_name}_${parameters_set}.log"
        unstripped_path="./snapshots/logs/${handler_name}_${parameters_set}.log.unstripped"
        serverless_runtime=$parameters_set[0]
        nodejs_version=$parameters_set[1]
        run_id=$parameters_set[2]
        # Fetch logs with serverless cli, retrying to avoid AWS account-wide rate limit error
        retry_counter=0
        while [ $retry_counter -lt 10 ]; do
            raw_logs=$(run_serverless logs --stage ${!run_id} -f $function_name --startTime $script_utc_start_time)
            fetch_logs_exit_code=$?
            if [ $fetch_logs_exit_code -eq 1 ]; then
                echo "Retrying fetch logs for $function_name..."
                retry_counter=$(($retry_counter + 1))
                sleep 10
                continue
            fi
            break
        done

        if [ $retry_counter -eq 9 ]; then
            echo "FAILURE: Could not retrieve logs for $function_name"
            echo "Error from final attempt to retrieve logs:"
            echo $raw_logs

            exit 1
        fi


        # Replace invocation-specific data like timestamps and IDs with XXXX to normalize logs across executions
        logs=$(
            echo "$raw_logs" |
                node parse-json.js |
                # Filter serverless cli errors
                sed '/Serverless: Recoverable error occurred/d' |
                # Normalize Lambda runtime report logs
                perl -p -e 's/(RequestId|TraceId|init|SegmentId|Duration|Memory Used|"e"):( )?[a-z0-9\.\-]+/\1:\2XXXX/g' |
                # Drop init duration from END lines; cold starts sometimes include it, warm starts do not.
                perl -p -e 's/ \(init: XXXX ms\)//g' |
                # Node.js 26 preview and container-image runtimes emit extra platform noise.
                sed '/preview runtime version and should not be used for production workloads/d' |
                sed '/^INIT_REPORT /d' |
                sed '/DEP0205.*module\.register()/d' |
                sed '/node --trace-deprecation.*where the warning was created/d' |
                # Normalize DD APM headers and AWS account ID
                perl -p -e "s/(x-datadog-parent-id:|x-datadog-trace-id:|account_id:)[0-9]+/\1XXXX/g" |
                # Strip API key from logged requests
                perl -p -e "s/(api_key=|'api_key': ')[a-z0-9\.\-]+/\1XXXX/g" |
                # Normalize log timestamps
                perl -p -e "s/[0-9]{4}\-[0-9]{2}\-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]+( \(\-?\+?[0-9:]+\))?/XXXX-XX-XX XX:XX:XX.XXX/" |
                # Normalize DD trace ID injection
                perl -p -e "s/(dd\.trace_id=)[0-9]+ (dd\.span_id=)[0-9]+/\1XXXX \2XXXX/" |
                # Normalize execution ID in logs prefix
                perl -p -e $'s/[0-9a-z]+\-[0-9a-z]+\-[0-9a-z]+\-[0-9a-z]+\-[0-9a-z]+\t/XXXX-XXXX-XXXX-XXXX-XXXX\t/' |
                # Normalize minor package version tag so that these snapshots aren't broken on version bumps
                perl -p -e "s/(dd_lambda_layer:datadog-nodev[0-9]+\.)[0-9]+\.[0-9]+/\1XX\.X/g" |
                perl -p -e 's/"(span_id|apiid|runtime-id|record_ids|parent_id|trace_id|start|duration|tcp\.local\.address|tcp\.local\.port|dns\.address|request_id|function_arn|x-datadog-trace-id|x-datadog-parent-id|datadog_lambda|dd_trace|process_id)":\ ("?)[a-zA-Z0-9\.:\-]+("?)/"\1":\2XXXX\3/g' |
                # Strip out run ID (from function name, resource, etc.)
                perl -p -e "s/${!run_id}/XXXX/g" |
                # Normalize line numbers in stack traces
                perl -p -e 's/(.js:)[0-9]*:[0-9]*/\1XXX:XXX/g' |
                # Remove metrics and metas in logged traces (their order is inconsistent)
                perl -p -e 's/"(meta|metrics)":{(.*?)}/"\1":{"XXXX": "XXXX"}/g' |
                # Normalize enhanced metric datadog_lambda tag
                perl -p -e "s/(datadog_lambda:v)[0-9\.]+/\1X.X.X/g" |
                # Normalize lookup resource
                perl -p -e "s/(\"resource\":\"169.)[0-9\.]+/\1X.X.X/g" |
                # Normalize Axios version
                perl -p -e "s/User-Agent:axios\/\d+\.\d+\.\d+/User-Agent:axios\/X\.X\.X/g" |
                # Remove init start line
                perl -p -e "s/INIT_START.*//g" |
                sed -E "s/(tracestate\:)([A-Za-z0-9\-\=\:\;].+)/\1XXX/g" |
                sed -E "s/(\"_dd.p.tid\"\: \")[a-z0-9\.\-]+/\1XXXX/g" |
                sed -E "s/(_dd.p.tid=)[a-z0-9\.\-]+/\1XXXX/g"
        )

        if [ ! -f $function_snapshot_path ]; then
            # If no snapshot file exists yet, we create one
            echo "Writing logs to $function_snapshot_path because no snapshot exists yet"
            echo "$logs" >$function_snapshot_path
        else
            # Compare new logs to snapshots
            diff_output=$(echo "$logs" | sort | diff -w - <(sort $function_snapshot_path))
            if [ $? -eq 1 ]; then
                if [ -n "$UPDATE_SNAPSHOTS" ]; then
                    # If $UPDATE_SNAPSHOTS is set to true write the new logs over the current snapshot
                    echo "Overwriting log snapshot for $function_snapshot_path"
                    echo "$logs" >$function_snapshot_path
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
    echo "If ECR push fails locally, update zip/layer snapshots only with SKIP_CONTAINER_TESTS=true."
    exit 1
fi

if [ -n "$UPDATE_SNAPSHOTS" ]; then
    echo "SUCCESS: Wrote new snapshots for all functions"
    exit 0
fi

echo "SUCCESS: No difference found between snapshots and new return values or logs"
