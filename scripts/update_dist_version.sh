#!/bin/sh
set -e
echo "Updating version constants"
DATADOG_LAMBDA_VERSION=$(cat package.json | jq -r ".version")
DD_TRACE_VERSION=$(cat package.json | jq -r ."devDependencies"'."dd-trace"')
sed -i -E "s/(datadogLambdaVersion = )\"(X.X.X)\"/\1\""$DATADOG_LAMBDA_VERSION"\"/" ./dist/trace/constants.js
sed -i -E "s/(ddtraceVersion = )\"(X.X.X)\"/\1\""$DD_TRACE_VERSION"\"/" ./dist/trace/constants.js