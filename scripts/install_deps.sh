#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# Installs the repo's dependencies, forcing the dd-trace v5 line on Node majors
# that dd-trace v6 doesn't support (node < 22). Every build, test and CI entry point should
# install through this script so the split is applied in exactly one place.
#
# USAGE: [TARGET_NODE_MAJOR=22] ./scripts/install_deps.sh [extra yarn args...]
#
# TARGET_NODE_MAJOR defaults to the Node major running this script. Set it
# when the host differs from the runtime being built for (e.g. Node 22
# packing a Node 18 fixture, which pins v5). Installing v6 still requires
# a host of Node 22+ so native prebuilds resolve.

set -e

scripts_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(dirname "$scripts_dir")

source "$scripts_dir/dd_trace_versions.sh"

cd "$repo_dir"

if [ -z "$TARGET_NODE_MAJOR" ]; then
    TARGET_NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
fi

dd_trace_override=$(dd_trace_version_for_node_major "$TARGET_NODE_MAJOR")
host_major=$(node -p "process.versions.node.split('.')[0]")

# v6's optional native addons (pprof, appsec, oxc-parser) ship prebuilds for
# Node 22+ only. --ignore-engines would let yarn extract the tarball on
# Node 18, then node-gyp-build fails and the tree is unusable. Pin v5 instead.
if [ -z "$dd_trace_override" ] && [ "$host_major" -lt "$DD_TRACE_V6_MIN_NODE_MAJOR" ]; then
    echo "dd-trace v6 cannot be installed on Node ${host_major} (engines.node >= ${DD_TRACE_V6_MIN_NODE_MAJOR})." >&2
    echo "Use Node ${DD_TRACE_V6_MIN_NODE_MAJOR}+, or set TARGET_NODE_MAJOR to 18 or 20 to pin v5." >&2
    exit 1
fi

# Nested packages still declare engines that reject some hosts; yarn 1
# otherwise fails the whole install on an engines mismatch.
yarn_args=("--ignore-engines")

if [ -n "$dd_trace_override" ]; then
    echo "Node ${TARGET_NODE_MAJOR} is not supported by dd-trace v6, pinning dd-trace to ${dd_trace_override}"
    # Rewrite the manifest against temporary backups and restore both tracked
    # files on exit, however the install ends. node_modules keeps the resolved
    # v5 line (which is what update_dist_version.sh reads), but leaving
    # package.json/yarn.lock modified would make the next v6 build on this
    # tree silently install the wrong tracer line against a dirty lockfile.
    package_backup=$(mktemp)
    lock_backup=$(mktemp)
    cp package.json "$package_backup"
    cp yarn.lock "$lock_backup"
    restore_manifests() {
        cp "$package_backup" package.json
        cp "$lock_backup" yarn.lock
        rm -f "$package_backup" "$lock_backup"
    }
    trap restore_manifests EXIT
    node ./scripts/set_ddtrace_version.js "$(cat package.json)" "$dd_trace_override" > package-new.json
    mv package-new.json package.json
    # The lockfile pins the v6 line, so it has to be re-resolved for v5.
else
    yarn_args+=("--frozen-lockfile")
fi

yarn install "${yarn_args[@]}" "$@"
