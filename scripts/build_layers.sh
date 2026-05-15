#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# Builds Datadog node layers for lambda functions, using Docker
set -e

LAYER_DIR=".layers"
LAYER_FILES_PREFIX="datadog_lambda_node"

# When changing any of these values, you must also change the corresponding
# value at https://github.com/DataDog/serverless-tools/blob/0fabf9a1ab96df3907c2e50fd8df7e1fbd6a1fca/.gitlab/setup.sh#L128
export NODE_VERSIONS=("18.12" "20.19" "22.11" "24.11")

if [ -z "$NODE_VERSION" ]; then
    echo "Node version not specified, running for all node versions."
else
    echo "Node version is specified: $NODE_VERSION"
    if (printf '%s\n' "${NODE_VERSIONS[@]}" | grep -xq $NODE_VERSION); then
        NODE_VERSIONS=($NODE_VERSION)
    else
        echo "Unsupported version found, valid options are : ${NODE_VERSIONS[@]}"
        exit 1
    fi
fi

function make_path_absolute {
    echo "$(cd "$(dirname "$1")"; pwd)/$(basename "$1")"
}

function docker_build_zip {
    # Args: [node version] [zip destination]

    destination=$(make_path_absolute $2)
    node_image_version=$(echo $1 | cut -d '.' -f 1)
    # Install datadog node in a docker container to avoid the mess from switching
    # between different node runtimes.
    temp_dir=$(mktemp -d)
    docker buildx build -t datadog-lambda-layer-node:$1 . --no-cache \
        --build-arg image=registry.ddbuild.io/images/mirror/node:${node_image_version}-bullseye --progress=plain -o $temp_dir/nodejs

    # Zip to destination, and keep directory structure as based in $temp_dir
    (cd $temp_dir && zip -q -r $destination ./)

    rm -rf $temp_dir
    echo "Done creating archive $destination"
}

rm -rf $LAYER_DIR
mkdir $LAYER_DIR


for current_node_version in "${NODE_VERSIONS[@]}"
do
    echo "Building layer for node${current_node_version}"
    docker_build_zip ${current_node_version} $LAYER_DIR/${LAYER_FILES_PREFIX}${current_node_version}.zip
done

echo "Done creating layers:"
ls $LAYER_DIR | xargs -I _ echo "$LAYER_DIR/_"
