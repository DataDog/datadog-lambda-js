#!/bin/sh
set -e
echo "Updating version constants"
DATADOG_LAMBDA_VERSION=$(cat package.json | jq -r ".version")
DD_TRACE_VERSION=$(sed -n -E "s/dd-trace@([0-9]*.[0-9]*.[0-9]*):/\1/p" yarn.lock)
sed -i -E "s/(datadogLambdaVersion = )\"(X.X.X)\"/\1\""$DATADOG_LAMBDA_VERSION"\"/" ./dist/trace/constants.js
sed -i -E "s/(ddtraceVersion = )\"(X.X.X)\"/\1\""$DD_TRACE_VERSION"\"/" ./dist/trace/constants.js
