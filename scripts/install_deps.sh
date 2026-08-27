#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# Installs Node dependencies, pinning dd-trace v5 on Node < 22.
# Used by layer builds, unit tests, and lint. Do not use before npm publish:
# yarn add rewrites package.json.

set -e

# dd-trace v6 requires Node 22+. Bump this manually for Node 18/20.
DDTRACE_V5_VERSION="~5.123.0"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR/.."

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")

if [ "$NODE_MAJOR" -lt 22 ]; then
    echo "Installing dd-trace@${DDTRACE_V5_VERSION} for Node ${NODE_MAJOR}"
    yarn add --dev --ignore-engines --no-progress "dd-trace@${DDTRACE_V5_VERSION}"
else
    echo "Installing dependencies from package.json for Node ${NODE_MAJOR}"
    yarn install --frozen-lockfile --ignore-engines --no-progress
fi
