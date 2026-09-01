#!/bin/bash

set -eo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
    echo "Usage: $0 <aws|rie> [raw|formatted]" >&2
    exit 2
fi

platform=$1
case "$platform" in
    aws)
        cold_start_filter="s/(\"cold_start\":[[:space:]]*)\"(?:true|false)\"/\$1\"XXXX\"/g"
        cold_start_filter+="; s/cold_start:(?:true|false)/cold_start:XXXX/g"
        leading_blank_filter='/./,$!d'
        ;;
    rie)
        cold_start_filter=''
        leading_blank_filter=''
        ;;
    *)
        echo "Unsupported integration-test platform: $platform" >&2
        exit 2
        ;;
esac

input_format=${2:-raw}
case "$input_format" in
    raw|formatted) ;;
    *)
        echo "Unsupported integration-test log format: $input_format" >&2
        exit 2
        ;;
esac

timestamp_filter="s/[0-9]{4}\\-[0-9]{2}\\-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]+"
timestamp_filter+="( \\(\\-?\\+?[0-9:]+\\))?/XXXX-XX-XX XX:XX:XX.XXX/"
volatile_value_filter="s/\"(span_id|apiid|runtime-id|record_ids|parent_id|trace_id|start|duration"
volatile_value_filter+="|tcp\\.local\\.address|tcp\\.local\\.port|dns\\.address|request_id|function_arn"
volatile_value_filter+="|x-datadog-trace-id|x-datadog-parent-id|datadog_lambda|dd_trace|process_id)\""
volatile_value_filter+=": (\"?)[a-zA-Z0-9\\.:\\-]+(\"?)/\"\$1\":\$2XXXX\$3/g"

script_path=${BASH_SOURCE[0]}
scripts_dir=$(dirname "$script_path")
repo_dir=$(dirname "$scripts_dir")

if [ "$input_format" = formatted ]; then
    cat
else
    node "$repo_dir/integration_tests/parse-json.js"
fi |
    sed '/Serverless: Recoverable error occurred/d' |
    perl -p -e 's/(RequestId|TraceId|init|SegmentId|Duration|Memory Used|"e"):( )?[a-z0-9\.\-]+/\1:\2XXXX/g' |
    sed '/preview runtime version and should not be used for production workloads/d' |
    sed '/^INIT_REPORT /d' |
    sed '/DEP0205.*module\.register()/d' |
    sed '/node --trace-deprecation.*where the warning was created/d' |
    perl -p -e 's/(x-datadog-parent-id:|x-datadog-trace-id:|account_id:)[0-9]+/$1XXXX/g' |
    perl -p -e 's/"(x-datadog-trace-id|x-datadog-parent-id)":"[0-9]+"/"$1":"XXXX"/g' |
    perl -p -e 's/"traceparent":"[0-9a-f-]+"/"traceparent":"XXXX"/g' |
    perl -p -e 's/"tracestate":"[^"]*"/"tracestate":"XXXX"/g' |
    perl -p -e "s/(api_key=|'api_key': ')[a-z0-9\.\-]+/\1XXXX/g" |
    perl -p -e "$timestamp_filter" |
    perl -p -e 's/[0-9]{4}\-[0-9]{2}\-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]+Z/XXXX-XX-XXTXX:XX:XX.XXXZ/' |
    perl -p -e 's/"requestId": "[0-9a-f-]+"/"requestId": "XXXX"/g' |
    perl -p -e 's/"requestId":"[0-9a-f-]+"/"requestId":"XXXX"/g' |
    perl -p -e 's/TimeoutOverflowWarning: [0-9]+/TimeoutOverflowWarning: XXXX/g' |
    perl -p -e 's/\\n\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)//g' |
    sed '/^(Use `node --trace-warnings \.\.\.` to show where the warning was created)$/d' |
    perl -p -e 's/\(node:[0-9]+\)/(node:XX)/g' |
    perl -p -e 's/(dd\.trace_id=)[0-9]+ (dd\.span_id=)[0-9]+/$1XXXX $2XXXX/' |
    perl -p -e $'s/[0-9a-z]+\-[0-9a-z]+\-[0-9a-z]+\-[0-9a-z]+\-[0-9a-z]+\t/XXXX-XXXX-XXXX-XXXX-XXXX\t/' |
    perl -p -e 's/(dd_lambda_layer:datadog-nodev[0-9]+\.)[0-9]+\.[0-9]+/$1XX.X/g' |
    perl -p -e "$volatile_value_filter" |
    perl -p -e 's/"dns\.addresses": "[^"]*"/"dns.addresses": "XXXX"/g' |
    RUN_ID="${RUN_ID:-}" perl -p -e 's/\Q$ENV{RUN_ID}\E/XXXX/g if length $ENV{RUN_ID}' |
    perl -p -e 's/(.js:)[0-9]*:[0-9]*/$1XXX:XXX/g' |
    perl -p -e 's/(datadog_lambda:v)[0-9\.]+/$1X.X.X/g' |
    perl -p -e 's/("resource":"169.)[0-9\.]+/$1X.X.X/g' |
    perl -p -e 's/User-Agent:axios\/\d+\.\d+\.\d+/User-Agent:axios\/X.X.X/g' |
    sed '/INIT_START Runtime Version:/d' |
    sed "$leading_blank_filter" |
    sed -E '/^[[:space:]]*"proactive_initialization(" *:|:true")/d' |
    perl -p -e "$cold_start_filter" |
    perl -p -e 's/ \(init: [^)]*\)//g' |
    perl -p -e 's/^[0-9]{2} \w{3} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2},[0-9]{3} (\[INFO\] \(rapid\))/XXXX $1/' |
    perl -p -e 's/(LocalProcessSupervisor\.Exec pid=)[0-9]+/$1XX/g' |
    perl -p -e 's/(requestId: )[0-9a-f-]+/$1XXXX/g' |
    perl -p -e 's/(duration(Ms)?: )[0-9.]+/$1XXXX/g' |
    sed -E 's/(tracestate\:)([A-Za-z0-9\-\=\:\;].+)/\1XXX/g' |
    sed -E 's/("_dd.p.tid"\: ")[a-z0-9\.\-]+/\1XXXX/g' |
    sed -E 's/(_dd.p.tid=)[a-z0-9\.\-]+/\1XXXX/g' |
    sed -E '/^REPORT RequestId:/s/[[:blank:]]+$//'
