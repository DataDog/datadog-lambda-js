#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# Release gate for the v5 pin in dd_trace_versions.sh. Fails when:
#   1. peerDependencies no longer lists both pins.
#   2. The pin lags latest published v5. Dep-update only tracks the v6 lockfile,
#      so 18/20 layers would ship a stale tracer.

set -e

scripts_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(dirname "$scripts_dir")

source "$scripts_dir/dd_trace_versions.sh"

dd_trace_range=$(node -p "require('$repo_dir/package.json').devDependencies['dd-trace']")
peer_range=$(node -p "require('$repo_dir/package.json').peerDependencies['dd-trace'] || ''")
expected_peer_range="^${DD_TRACE_V5_VERSION} || ${dd_trace_range}"

if [ "$peer_range" != "$expected_peer_range" ]; then
    echo "peerDependencies['dd-trace'] does not advertise the versions this repo builds against." >&2
    echo "  expected: $expected_peer_range" >&2
    echo "  found:    $peer_range" >&2
    echo "Update peerDependencies in package.json to match both pins" >&2
    exit 1
fi

echo "peerDependencies['dd-trace'] advertises both pins: $peer_range"

# npm may return a single string or an array of matching versions; take the
# last. Parsed with node rather than jq so the script only needs tools the
# build images are guaranteed to have.
latest_v5=$(npm view 'dd-trace@5' version --json | node -e "
let d = '';
process.stdin
  .on('data', (c) => (d += c))
  .on('end', () => {
    const v = JSON.parse(d);
    console.log(Array.isArray(v) ? v[v.length - 1] : v);
  });
")

if [ -z "$latest_v5" ]; then
    echo "Could not determine the latest dd-trace v5 version from the npm registry" >&2
    exit 1
fi

if [ "$DD_TRACE_V5_VERSION" != "$latest_v5" ]; then
    echo "dd-trace v5 pin is stale: configured=$DD_TRACE_V5_VERSION latest=$latest_v5" >&2
    echo "Bump DD_TRACE_V5_VERSION in scripts/dd_trace_versions.sh" >&2
    exit 1
fi

echo "dd-trace v5 pin is current: $DD_TRACE_V5_VERSION"
