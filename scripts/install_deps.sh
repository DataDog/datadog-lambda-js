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
# explicitly when the host Node version differs from the runtime being built
# for, e.g. the GitLab CI image runs Node 18 but builds for every runtime.

set -e

scripts_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(dirname "$scripts_dir")

source "$scripts_dir/dd_trace_versions.sh"

cd "$repo_dir"

if [ -z "$TARGET_NODE_MAJOR" ]; then
    TARGET_NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
fi

dd_trace_override=$(dd_trace_version_for_node_major "$TARGET_NODE_MAJOR")

# --ignore-engines is needed on both paths: dd-trace v6 refuses to install on
# hosts older than Node 22 even when it is only being built for a newer runtime.
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
