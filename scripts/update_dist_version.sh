#!/bin/sh
set -e
echo "Updating version constants"
DATADOG_LAMBDA_VERSION=$(node -pe "require('./package.json').version")
DD_TRACE_VERSION=$(sed -n -E "s/dd-trace@([0-9]*\.[0-9]*\.[0-9]*):/\1/p" yarn.lock)
echo "Datadog Lambda Library Version ${DATADOG_LAMBDA_VERSION}"
echo "Datadog Trace Library Version ${DD_TRACE_VERSION}"

MAIN_CONSTANTS=$(cat ./dist/constants.js)
TRACE_CONSTANTS=$(cat ./dist/trace/constants.js)

echo "$MAIN_CONSTANTS" |
  sed "s/\(datadogLambdaVersion =\) \"\(X\.X\.X\)\"/\1 \"$DATADOG_LAMBDA_VERSION\"/" > ./dist/constants.js

echo "$TRACE_CONSTANTS" |
  sed "s/\(ddtraceVersion =\) \"\(X\.X\.X\)\"/\1 \"$DD_TRACE_VERSION\"/" > ./dist/trace/constants.js

echo "Copying handler js files"
cp src/handler.* dist/
cp src/runtime/module_importer.js dist/runtime/
