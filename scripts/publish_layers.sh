#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# Publish the datadog node lambda layer across regions, using the AWS CLI
# Usage: VERSION=5 REGIONS=us-east-1 LAYERS=Datadog-Node20-x publish_layers.sh
# VERSION is required.
set -e

NODE_VERSIONS_FOR_AWS_CLI=("nodejs18.x" "nodejs20.x" "nodejs22.x")
LAYER_PATHS=(".layers/datadog_lambda_node18.12.zip" ".layers/datadog_lambda_node20.9.zip" ".layers/datadog_lambda_node22.11.zip")
AVAILABLE_LAYERS=("Datadog-Node18-x" "Datadog-Node20-x" "Datadog-Node22-x")
AVAILABLE_REGIONS=$(aws ec2 describe-regions | jq -r '.[] | .[] | .RegionName')
BATCH_SIZE=60
PIDS=()

# Makes sure any subprocesses will be terminated with this process
trap "pkill -P $$; exit 1;" INT

# Check that the layer files exist
for layer_file in "${LAYER_PATHS[@]}"
do
    if [ ! -f $layer_file  ]; then
        echo "Could not find $layer_file."
        exit 1
    fi
done

# Determine the target regions
if [ -z "$REGIONS" ]; then
    echo "Region not specified, running for all available regions."
    REGIONS=$AVAILABLE_REGIONS
else
    echo "Region specified: $REGIONS"
    if [[ ! "$AVAILABLE_REGIONS" == *"$REGIONS"* ]]; then
        echo "Could not find $REGIONS in available regions: $AVAILABLE_REGIONS"
        echo ""
        echo "EXITING SCRIPT."
        exit 1
    fi
fi

# Determine the target layers
if [ -z "$LAYERS" ]; then
    echo "Layer not specified, running for all layers."
    LAYERS=("${AVAILABLE_LAYERS[@]}")
else
    echo "Layer specified: $LAYERS"
    if [[ ! " ${AVAILABLE_LAYERS[@]} " =~ " ${LAYERS} " ]]; then
        echo "Could not find $LAYERS in available layers: ${AVAILABLE_LAYERS[@]}"
        echo ""
        echo "EXITING SCRIPT."
        exit 1
    fi
fi

# Determine the target layer version
if [ -z "$VERSION" ]; then
    echo "Layer version not specified"
    echo ""
    echo "EXITING SCRIPT."
    exit 1
else
    echo "Layer version specified: $VERSION"
fi

read -p "Ready to publish version $VERSION of layers ${LAYERS[*]} to regions ${REGIONS[*]} (y/n)?" CONT
if [ "$CONT" != "y" ]; then
    echo "Exiting"
    exit 1
fi

index_of_layer() {
    layer_name=$1
    for i in "${!AVAILABLE_LAYERS[@]}"; do
        if [[ "${AVAILABLE_LAYERS[$i]}" = "${layer_name}" ]]; then
            echo "${i}";
        fi
    done
}

publish_layer() {
    region=$1
    layer_name=$2
    aws_version_key=$3
    layer_path=$4

    version_nbr=$(aws lambda publish-layer-version --layer-name $layer_name \
        --description "Datadog Lambda Layer for Node" \
        --zip-file "fileb://$layer_path" \
        --region $region \
        --compatible-runtimes $aws_version_key \
                        | jq -r '.Version')

    permission=$(aws lambda add-layer-version-permission --layer-name $layer_name \
        --version-number $version_nbr \
        --statement-id "release-$version_nbr" \
        --action lambda:GetLayerVersion --principal "*" \
        --region $region)

    echo $version_nbr
}

wait_for_processes() {
    for pid in "${PIDS[@]}"; do
        wait $pid
    done
    PIDS=()
}

backfill_layers() {
    latest_version=$1
    region=$2
    layer_name=$3
    aws_version_key=$4
    layer_path=$5
    while [ $latest_version -lt $VERSION ]; do
            latest_version=$(publish_layer $region $layer_name $aws_version_key $layer_path)
            echo "Published version $latest_version for layer $layer_name in region $region"

            # This shouldn't happen unless someone manually deleted the latest version, say 28, and
            # then tries to republish 28 again. The published version would actually be 29, because
            # Lambda layers are immutable and AWS will skip deleted version and use the next number.
            if [ $latest_version -gt $VERSION ]; then
                echo "ERROR: Published version $latest_version is greater than the desired version $VERSION!"
                echo "Exiting"
                exit 1
            fi
    done
}

for region in $REGIONS
do
    echo "Starting publishing layer for region $region..."

    for layer_name in "${LAYERS[@]}"; do
        latest_version=$(aws lambda list-layer-versions --region $region --layer-name $layer_name --query 'LayerVersions[0].Version || `0`')
        if [ $latest_version -ge $VERSION ]; then
            echo "Layer $layer_name version $VERSION already exists in region $region, skipping..."
            continue
        elif [ $latest_version -lt $((VERSION-1)) ]; then
            echo "WARNING: The latest version of layer $layer_name in region $region is $latest_version, this will publish all the missing versions including $VERSION"
        fi

        index=$(index_of_layer $layer_name)
        aws_version_key="${NODE_VERSIONS_FOR_AWS_CLI[$index]}"
        layer_path="${LAYER_PATHS[$index]}"

        backfill_layers $latest_version $region $layer_name $aws_version_key $layer_path &
        PIDS+=($!)
        if [ ${#PIDS[@]} -eq $BATCH_SIZE ]; then
            wait_for_processes
        fi
    done
done
wait_for_processes
echo "Done !"
