#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# dd-trace v6 declares `engines.node: ">=22"`, so the Node 18 and Node 20 layers
# ship the v5 line instead. The v5 pin below is bumped by hand.
DD_TRACE_V5_VERSION="5.124.0"
DD_TRACE_V6_MIN_NODE_MAJOR=22

# Echoes the dd-trace version to force for a given Node major, or nothing when
# the version from package.json (v6) should be used as-is.
dd_trace_version_for_node_major() {
    if [ "$1" -lt "$DD_TRACE_V6_MIN_NODE_MAJOR" ]; then
        echo "$DD_TRACE_V5_VERSION"
    fi
}
