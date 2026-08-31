#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# Release gate: fails when the hand-maintained dd-trace v5 pin in
# dd_trace_versions.sh has fallen behind the latest published v5. The pin is
# not covered by the dependency-update workflow (which tracks the v6 line in
# package.json/yarn.lock), so without this check it silently goes stale and
# the Node 18/20 layers ship an old tracer.
#
# Requires network access to the npm registry.

set -e

scripts_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

source "$scripts_dir/dd_trace_versions.sh"

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
