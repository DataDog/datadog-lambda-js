#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2023 Datadog, Inc.

# NODE_VERSION=20.19 REGION=us-east-1

set -e

# Available runtimes: https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
AWS_CLI_NODE_VERSIONS=("nodejs18.x" "nodejs20.x" "nodejs22.x" "nodejs24.x")
LAYER_PATHS=(".layers/datadog_lambda_node18.12.zip" ".layers/datadog_lambda_node20.19.zip" ".layers/datadog_lambda_node22.11.zip" ".layers/datadog_lambda_node24.11.zip")
LAYERS=("Datadog-Node18-x" "Datadog-Node20-x" "Datadog-Node22-x" "Datadog-Node24-x")
NODE_VERSIONS=("18.12" "20.19" "22.11" "24.11")
STAGES=('prod', 'sandbox', 'staging')

# Ensure the argument arrays have the same length
expected_length=${#AWS_CLI_NODE_VERSIONS[@]}
if [[ ${#LAYER_PATHS[@]} -ne $expected_length ]] || \
   [[ ${#LAYERS[@]} -ne $expected_length ]] || \
   [[ ${#NODE_VERSIONS[@]} -ne $expected_length ]]; then
    echo "ERROR: arguments AWS_CLI_NODE_VERSIONS, LAYER_PATHS, LAYERS, and NODE_VERSIONS must have the same number of entries."
    echo "AWS_CLI_NODE_VERSIONS has ${#AWS_CLI_NODE_VERSIONS[@]} entries."
    echo "LAYER_PATHS has ${#LAYER_PATHS[@]} entries."
    echo "LAYERS has ${#LAYERS[@]} entries."
    echo "NODE_VERSIONS has ${#NODE_VERSIONS[@]} entries."
    exit 1
fi

printf "Starting script...\n\n"

publish_layer() {
    region=$1
    layer_name=$2
    compatible_runtimes=$3
    layer_path=$4

    version_nbr=$(aws lambda publish-layer-version --layer-name $layer_name \
        --description "Datadog Lambda Layer for Node" \
        --zip-file "fileb://$layer_path" \
        --region $region \
        --compatible-runtimes $compatible_runtimes \
                        | jq -r '.Version')

    permission=$(aws lambda add-layer-version-permission --layer-name $layer_name \
        --version-number $version_nbr \
        --statement-id "release-$version_nbr" \
        --action lambda:GetLayerVersion --principal "*" \
        --region $region)

    echo $version_nbr
}

# Target Node version
if [ -z $NODE_VERSION ]; then
    printf "[Error] NODE_VERSION version not specified.\n"
    exit 1
fi

printf "Node version specified: $NODE_VERSION\n"
if [[ ! ${NODE_VERSIONS[@]} =~ $NODE_VERSION ]]; then
    printf "[Error] Unsupported NODE_VERSION found.\n"
    exit 1
fi

index=0
for i in "${!NODE_VERSIONS[@]}"; do
    if [[ "${NODE_VERSIONS[$i]}" = "${NODE_VERSION}" ]]; then
       index=$i
    fi
done

REGIONS=$(aws ec2 describe-regions | jq -r '.[] | .[] | .RegionName')

# Target region
if [ -z "$REGION" ]; then
    printf "REGION not specified.\n"
    exit 1
fi

printf "Region specified, region is: $REGION\n"
if [[ ! "$REGIONS" == *"$REGION"* ]]; then
    printf "[Error] Could not find $REGION in AWS available regions: \n${REGIONS[@]}\n"
    exit 1
fi

# Deploy stage
if [ -z "$STAGE" ]; then
    printf "[Error] STAGE not specified.\n"
    printf "Exiting script...\n"
    exit 1
fi

printf "Stage specified: $STAGE\n"
if [[ ! ${STAGES[@]} =~ $STAGE ]]; then
    printf "[Error] Unsupported STAGE found.\n"
    exit 1
fi

layer="${LAYERS[$index]}"

if [[ "$STAGE" =~ ^(staging|sandbox)$ ]]; then
    # Deploy latest version
    latest_version=$(aws lambda list-layer-versions --region $REGION --layer-name $layer --query 'LayerVersions[0].Version || `0`')
    VERSION=$(($latest_version + 1))
else
    # Running on prod
    if [ -z "$CI_COMMIT_TAG" ]; then
        # this happens during manual govcloud releases.
        if [ -z "$VERSION" ]; then
            printf "[Error] No CI_COMMIT_TAG or VERSION found.\n"
            printf "Exiting script...\n"
            exit 1
        else
            printf "Using provided VERSION: $VERSION\n"
        fi
    else
        printf "Tag found in environment: $CI_COMMIT_TAG\n"
        VERSION=$(echo "${CI_COMMIT_TAG##*v}" | cut -d. -f2)
    fi
fi

# Target layer version
if [ -z "$VERSION" ]; then
    printf "[Error] VERSION for layer version not specified.\n"
    printf "Exiting script...\n"
    exit 1
else
    printf "Layer version parsed: $VERSION\n"
fi

printf "[$REGION] Starting publishing layers...\n"
aws_cli_node_version_key="${AWS_CLI_NODE_VERSIONS[$index]}"
layer_path="${LAYER_PATHS[$index]}"

latest_version=$(aws lambda list-layer-versions --region $REGION --layer-name $layer --query 'LayerVersions[0].Version || `0`')
if [ $latest_version -ge $VERSION ]; then
    printf "[$REGION] Layer $layer version $VERSION already exists in region $REGION, skipping...\n"
    exit 0
elif [ $latest_version -lt $((VERSION-1)) ]; then
    printf "[$REGION][WARNING] The latest version of layer $layer in region $REGION is $latest_version, this will publish all the missing versions including $VERSION\n"
fi

while [ $latest_version -lt $VERSION ]; do
    latest_version=$(publish_layer $REGION $layer $aws_cli_node_version_key $layer_path)
    printf "[$REGION] Published version $latest_version for layer $layer in region $REGION\n"

    # This shouldn't happen unless someone manually deleted the latest version, say 28, and
    # then tries to republish 28 again. The published version would actually be 29, because
    # Lambda layers are immutable and AWS will skip deleted version and use the next number.
    if [ $latest_version -gt $VERSION ]; then
        printf "[$REGION] Published version $latest_version is greater than the desired version $VERSION!"
        exit 1
    fi
done

printf "[$REGION] Finished publishing layers...\n\n"
