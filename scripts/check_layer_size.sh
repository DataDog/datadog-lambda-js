#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# Compares layer size to threshold, and fails if below that threshold

# 5 mb size limit
MAX_LAYER_COMPRESSED_SIZE_KB=$(expr 5 \* 1024) 
MAX_LAYER_UNCOMPRESSED_SIZE_KB=$(expr 15 \* 1024) 


LAYER_FILES_PREFIX="datadog_lambda_node"
LAYER_DIR=".layers"
NODE_VERSIONS=("10.15" "12.13" "14.15")

for node_version in "${NODE_VERSIONS[@]}"
do
    FILE=$LAYER_DIR/${LAYER_FILES_PREFIX}${node_version}.zip
    FILE_SIZE=$(stat --printf="%s" $FILE)
    FILE_SIZE_KB="$(( ${FILE_SIZE%% *} / 1024))"
    echo "Layer file ${FILE} has zipped size ${FILE_SIZE_KB} kb"
    if [ "$FILE_SIZE_KB" -gt "$MAX_LAYER_COMPRESSED_SIZE_KB" ]; then
        echo "Zipped size exceeded limit $MAX_LAYER_COMPRESSED_SIZE_KB kb"
        exit 1
    fi
    mkdir tmp
    unzip -q $FILE -d tmp
    UNZIPPED_FILE_SIZE=$(du -shb tmp/ | cut -f1)
    UNZIPPED_FILE_SIZE_KB="$(( ${UNZIPPED_FILE_SIZE%% *} / 1024))"
    rm -rf tmp
    echo "Layer file ${FILE} has unzipped size ${UNZIPPED_FILE_SIZE_KB} kb"
    if [ "$UNZIPPED_FILE_SIZE_KB" -gt "$MAX_LAYER_UNCOMPRESSED_SIZE_KB" ]; then
        echo "Unzipped size exceeded limit $MAX_LAYER_UNCOMPRESSED_SIZE_KB kb"
        exit 1
    fi
done