#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# Installs a packed datadog-lambda-js tarball into a throwaway project and checks it works on the
# Node major running this script, both with no tracer at all and with the dd-trace line that
# major supports.
#
# The layers bundle their own tracer, so the integration fixtures only prove the code works with
# a tracer someone else chose. This is the only place the published package's own compatibility
# contract (engines + the optional dd-trace peer range) is exercised.
#
# USAGE: ./scripts/test_npm_package.sh <path to datadog-lambda-js-*.tgz>

set -e

scripts_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(dirname "$scripts_dir")

source "$scripts_dir/dd_trace_versions.sh"

tarball=$1
if [ -z "$tarball" ]; then
    echo "Usage: ./scripts/test_npm_package.sh <path to datadog-lambda-js-*.tgz>" >&2
    exit 1
fi
if [ ! -f "$tarball" ]; then
    echo "No such tarball: $tarball" >&2
    exit 1
fi
tarball=$(cd "$(dirname "$tarball")" && pwd)/$(basename "$tarball")

node_major=$(node -p "process.versions.node.split('.')[0]")
dd_trace_version=$(dd_trace_version_for_node_major "$node_major")
if [ -z "$dd_trace_version" ]; then
    # No override for this major means the v6 range in package.json applies.
    dd_trace_version=$(node -p "require('$repo_dir/package.json').devDependencies['dd-trace']")
fi

consumer_dir=$(mktemp -d)
trap 'rm -rf "$consumer_dir"' EXIT
cd "$consumer_dir"

npm init -y > /dev/null

echo "Checking datadog-lambda-js on Node ${node_major} with no tracer installed"
# An optional peer must not drag a tracer in, and metrics-only operation has to keep working.
npm install --no-audit --no-fund "$tarball" > /dev/null
if [ -d node_modules/dd-trace ]; then
    echo "dd-trace was installed even though the peer dependency is optional" >&2
    exit 1
fi
node "$scripts_dir/assert_npm_package.js" no-tracer

echo "Checking datadog-lambda-js on Node ${node_major} against dd-trace ${dd_trace_version}"
npm install --no-audit --no-fund "dd-trace@${dd_trace_version}" > /dev/null
DD_TRACE_STARTUP_LOGS=false node "$scripts_dir/assert_npm_package.js" with-tracer

echo "npm package works on Node ${node_major} with dd-trace ${dd_trace_version}"
