#!/bin/bash

# Local log-normalization pipeline for integration test snapshots.
#
# This is based on the filter chain used by scripts/run_integration_tests.sh
# to replace invocation-specific data (timestamps, IDs, durations, ...) with
# XXXX before diffing logs against snapshots. Local-only RIE filters and
# deterministic cold-start assertions are documented below.
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

# An empty Perl program is a pass-through when RUN_ID is unset.
run_id_filter=''
if [ -n "$RUN_ID" ]; then
    run_id_filter="s/${RUN_ID}/XXXX/g"
fi

node "$repo_dir/integration_tests/parse-json.js" |
    # Filter serverless cli errors
    sed '/Serverless: Recoverable error occurred/d' |
    # Normalize Lambda runtime report logs
    perl -p -e 's/(RequestId|TraceId|init|SegmentId|Duration|Memory Used|"e"):( )?[a-z0-9\.\-]+/\1:\2XXXX/g' |
    # Node.js 26 preview and container-image runtimes emit extra platform noise.
    sed '/preview runtime version and should not be used for production workloads/d' |
    sed '/^INIT_REPORT /d' |
    sed '/DEP0205.*module\.register()/d' |
    sed '/node --trace-deprecation.*where the warning was created/d' |
    # Normalize DD APM headers and AWS account ID
    perl -p -e "s/(x-datadog-parent-id:|x-datadog-trace-id:|account_id:)[0-9]+/\1XXXX/g" |
    # Same headers as echoed by the http-requests fixture's mock server —
    # JSON.stringify output, i.e. quoted with no space after the colon —
    # plus the W3C traceparent/tracestate pair it also echoes.
    perl -p -e 's/"(x-datadog-trace-id|x-datadog-parent-id)":"[0-9]+"/"\1":"XXXX"/g' |
    perl -p -e 's/"traceparent":"[0-9a-f-]+"/"traceparent":"XXXX"/g' |
    perl -p -e 's/"tracestate":"[^"]*"/"tracestate":"XXXX"/g' |
    # Strip API key from logged requests
    perl -p -e "s/(api_key=|'api_key': ')[a-z0-9\.\-]+/\1XXXX/g" |
    # Normalize log timestamps
    perl -p -e "s/[0-9]{4}\-[0-9]{2}\-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]+( \(\-?\+?[0-9:]+\))?/XXXX-XX-XX XX:XX:XX.XXX/" |
    # Same for the ISO8601-with-T format the RIC uses on ERROR lines under RIE
    # (e.g. "2026-08-28T04:00:26.774Z\t<request-id>\tERROR\tInvoke Error ...")
    perl -p -e "s/[0-9]{4}\-[0-9]{2}\-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]+Z/XXXX-XX-XXTXX:XX:XX.XXXZ/" |
    # Managed-instances (proactive-init case) structured logs: per-invocation
    # request ids, and the overflow value in Node's TimeoutOverflowWarning,
    # which is derived from a wall-clock deadline and varies run to run.
    perl -p -e 's/"requestId": "[0-9a-f-]+"/"requestId": "XXXX"/g' |
    # Same id in the compact JSON the preview RIC uses on Invoke Error lines.
    perl -p -e 's/"requestId":"[0-9a-f-]+"/"requestId":"XXXX"/g' |
    perl -p -e 's/TimeoutOverflowWarning: [0-9]+/TimeoutOverflowWarning: XXXX/g' |
    # Node appends its once-per-process "trace-warnings" hint to whichever
    # warning happens to be emitted first — which one is racy (and differs
    # between amd64 CI and arm64 local runs). Drop the hint in both its
    # JSON-embedded (\n literal) and standalone-line forms.
    perl -p -e 's/\\n\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)//g' |
    sed '/^(Use `node --trace-warnings \.\.\.` to show where the warning was created)$/d' |
    # Pid in Node's "(node:NN)" warning prefix varies with process layout.
    perl -p -e 's/\(node:[0-9]+\)/(node:XX)/g' |
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
    # Preserve stable span meta and metrics; volatile values are normalized above.
    # Normalize enhanced metric datadog_lambda tag
    perl -p -e "s/(datadog_lambda:v)[0-9\.]+/\1X.X.X/g" |
    # Normalize lookup resource
    perl -p -e "s/(\"resource\":\"169.)[0-9\.]+/\1X.X.X/g" |
    # Normalize Axios version
    perl -p -e "s/User-Agent:axios\/\d+\.\d+\.\d+/User-Agent:axios\/X\.X\.X/g" |
    # Remove init start line
    perl -p -e "s/INIT_START.*//g" |
    # Proactive initialization is platform scheduling, not code behavior.
    # Keep cold_start to cover the deterministic local cold-to-warm transition.
    sed '/proactive_initialization/d' |
    perl -p -e 's/ \(init: [^)]*\)//g' |
    # Normalize RIE platform log lines (local harness only; no-op on AWS logs):
    # "28 Jul 2026 19:42:34,536 [INFO] (rapid) ..." timestamps, request ids,
    # and init/invoke durations vary run to run
    perl -p -e 's/^[0-9]{2} \w{3} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2},[0-9]{3} (\[INFO\] \(rapid\))/XXXX \1/' |
    # Managed-instances supervisor line embeds a container pid: pid=NN.
    perl -p -e 's/(LocalProcessSupervisor\.Exec pid=)[0-9]+/\1XX/g' |
    perl -p -e 's/(requestId: )[0-9a-f-]+/\1XXXX/g' |
    perl -p -e 's/(duration(Ms)?: )[0-9.]+/\1XXXX/g' |
    sed -E "s/(tracestate\:)([A-Za-z0-9\-\=\:\;].+)/\1XXX/g" |
    sed -E "s/(\"_dd.p.tid\"\: \")[a-z0-9\.\-]+/\1XXXX/g" |
    sed -E "s/(_dd.p.tid=)[a-z0-9\.\-]+/\1XXXX/g" |
    # Remove RIE's trailing REPORT tab without changing application output.
    sed -E '/^REPORT RequestId:/s/[[:blank:]]+$//'
