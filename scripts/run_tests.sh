#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# Run unit tests in Docker
# For local use only
set -e

NODE_VERSIONS=("18.12" "20.19" "22.11" "24.11")

for node_version in "${NODE_VERSIONS[@]}"
do
    node_major_version=$(echo $node_version | cut -d '.' -f 1)
    echo "Running tests against node${node_version}"
    docker build -t datadog-lambda-layer-node-test:$node_version \
        -f scripts/Dockerfile_test . \
        --quiet \
        --build-arg image=registry.ddbuild.io/images/mirror/node:${node_major_version}-bullseye
    docker run --rm -v `pwd`:/datadog-lambda-layer-node \
        -w /datadog-lambda-layer-node \
        datadog-lambda-layer-node-test:$node_version \
        yarn test
done
