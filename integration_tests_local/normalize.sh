#!/bin/bash

# Shared log-normalization pipeline for integration test snapshots.
#
# This is the exact filter chain used by scripts/run_integration_tests.sh
# (lines 212-248) to replace invocation-specific data (timestamps, IDs,
# durations, ...) with XXXX before diffing logs against snapshots.
# It is factored out here so both the AWS-based suite and the local
# RIE-based harness (integration_tests_local/run.sh) normalize identically.
#
# Usage:
#   some-log-producer | ./normalize.sh
#   RUN_ID=abcdef12 ./normalize.sh < raw.log > normalized.log
#
# Reads from stdin, writes to stdout.
# Optional env:
#   RUN_ID - random per-run ID embedded in deployed function names; stripped
#            to XXXX when set (AWS suite only; the local harness uses static
#            function names and leaves this unset).

set -e

script_path=${BASH_SOURCE[0]}
local_dir=$(dirname "$script_path")
repo_dir=$(dirname "$local_dir")

run_id_filter='s/$/^/' # no-op by default (matches nothing useful, harmless)
if [ -n "$RUN_ID" ]; then
    run_id_filter="s/${RUN_ID}/XXXX/g"
fi

node "$repo_dir/integration_tests/parse-json.js" |
    # Filter serverless cli errors
    sed '/Serverless: Recoverable error occurred/d' |
    # Normalize Lambda runtime report logs
    perl -p -e 's/(RequestId|TraceId|init|SegmentId|Duration|Memory Used|"e"):( )?[a-z0-9\.\-]+/\1:\2XXXX/g' |
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
    perl -p -e "$run_id_filter" |
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
    # Drop proactive-initialization markers: whether AWS proactively
    # initializes a sandbox (>10s before the first invoke, see
    # src/utils/cold-start.ts) is platform scheduling and varies run
    # to run, so snapshots must not assert on it. Same rules as
    # scripts/run_integration_tests.sh.
    sed '/proactive_initialization/d' |
    perl -p -e 's/ \(init: [^)]*\)//g' |
    perl -p -e 's/"cold_start:(true|false)"/"cold_start:XXXX"/g' |
    # Normalize RIE platform log lines (local harness only; no-op on AWS logs):
    # "28 Jul 2026 19:42:34,536 [INFO] (rapid) ..." timestamps, request ids,
    # and init/invoke durations vary run to run
    perl -p -e 's/^[0-9]{2} \w{3} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2},[0-9]{3} (\[INFO\] \(rapid\))/XXXX \1/' |
    perl -p -e 's/(requestId: )[0-9a-f-]+/\1XXXX/g' |
    perl -p -e 's/(duration(Ms)?: )[0-9.]+/\1XXXX/g' |
    sed -E "s/(tracestate\:)([A-Za-z0-9\-\=\:\;].+)/\1XXX/g" |
    sed -E "s/(\"_dd.p.tid\"\: \")[a-z0-9\.\-]+/\1XXXX/g" |
    sed -E "s/(_dd.p.tid=)[a-z0-9\.\-]+/\1XXXX/g"
