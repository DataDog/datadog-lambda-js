
#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2022 Datadog, Inc.

# Builds Datadog node layers for lambda functions, using Docker
set -e
export NODE_VERSIONS=("12" "14")

script_path=${BASH_SOURCE[0]}
cd $(dirname $script_path)/..
ls
rm -rf .vendored
mkdir .vendored

function docker_build {
    # Args: [node version] [zip destination]
    arch=$2
    temp_dir=$(mktemp -d)
    echo $temp_dir
    docker buildx build -t deasync-node-${arch}:$1 . -f ./scripts/Dockerfile.deasync --no-cache \
        --build-arg image=node:$1 \
        --platform linux/${arch} \
        --load
    docker run deasync-node-${arch}:$1 tar cf - node_modules | tar -xf - -C $temp_dir
    cp -rf $temp_dir/node_modules/deasync/bin/linux-*-node-$1 .vendored/

}
for node_version in "${NODE_VERSIONS[@]}"
do
    docker_build $node_version arm64
done

