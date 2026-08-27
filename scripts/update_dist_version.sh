#!/bin/sh
set -e
echo "Updating version constants"
DATADOG_LAMBDA_VERSION=$(node -pe "require('./package.json').version")
# Read the resolved version off the install rather than the lockfile: the layer
# builds for Node 18/20 re-resolve dd-trace to the v5 line, and a lockfile range
# such as ^6.12.0 is not a version to begin with.
DD_TRACE_VERSION=$(node -pe "require('dd-trace/package.json').version" 2>/dev/null || echo "")
echo "Datadog Lambda Library Version ${DATADOG_LAMBDA_VERSION}"
echo "Datadog Trace Library Version ${DD_TRACE_VERSION}"

MAIN_CONSTANTS=$(cat ./dist/constants.js)
TRACE_CONSTANTS=$(cat ./dist/trace/constants.js)

echo "$MAIN_CONSTANTS" |
  sed "s/\(datadogLambdaVersion =\) \"\(X\.X\.X\)\"/\1 \"$DATADOG_LAMBDA_VERSION\"/" > ./dist/constants.js

echo "$TRACE_CONSTANTS" |
  sed "s/\(ddtraceVersion =\) \"\(X\.X\.X\)\"/\1 \"$DD_TRACE_VERSION\"/" > ./dist/trace/constants.js

echo "Copying handler files"
# Only handler.mjs ships as a Lambda entry point. Lambda's bootstrap resolves
# `dist/handler.handler` to handler.mjs (it falls through `.js` -> `.mjs`),
# and handler.mjs's async `load()` handles both CJS and ESM user modules, so
# a separate `.js` / `.cjs` variant is no longer needed.
#
# Remove any stale `dist/handler.js` / `dist/handler.cjs` left over from prior
# builds — tsc doesn't clean dist between incremental compiles, and shipping
# either of those files would re-introduce the resolver bug this PR fixes.
rm -f dist/handler.js dist/handler.cjs
cp src/handler.mjs dist/
cp src/init.js dist/init.js
cp src/runtime/module_importer.js dist/runtime/
