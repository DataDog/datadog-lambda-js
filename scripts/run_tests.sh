#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# Run unit tests in Docker
set -e

NODE_VERSIONS=("10.15" "8.10")

for node_version in "${NODE_VERSIONS[@]}"
do
    echo "Running tests against node${node_version}"
    docker build -t datadog-lambda-layer-node-test:$node_version \
        -f scripts/Dockerfile_test . \
        --quiet \
        --build-arg image=node:$node_version-alpine
    docker run --rm -v `pwd`:/datadog-lambda-layer-node \
        -w /datadog-lambda-layer-node \
        datadog-lambda-layer-node-test:$node_version \
        yarn test
done