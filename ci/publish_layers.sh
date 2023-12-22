#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2023 Datadog, Inc.

# NODE_VERSION=14.15 REGION=us-east-1

set -e

# Available runtimes: https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
AWS_CLI_NODE_VERSIONS=("nodejs14.x" "nodejs16.x" "nodejs18.x" "nodejs20.x")
LAYER_PATHS=(".layers/datadog_lambda_node14.15.zip" ".layers/datadog_lambda_node16.14.zip" ".layers/datadog_lambda_node18.12.zip" ".layers/datadog_lambda_node20.9.zip")
LAYERS=("Datadog-Node14-x-GITLAB" "Datadog-Node16-x-GITLAB" "Datadog-Node18-x-GITLAB" "Datadog-Node20-x-GITLAB")
NODE_VERSIONS=("14.15" "16.14" "18.12" "20.9")

printf "Starting script...\n\n"
printf "Installing dependencies\n"
pip install awscli

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

if [ -z "$CI_COMMIT_TAG" ]; then
    printf "[Error] No CI_COMMIT_TAG found.\n"
    printf "Exiting script...\n"
    exit 1
else
    printf "Tag found in environment: $CI_COMMIT_TAG\n"
fi

VERSION=$(echo "${CI_COMMIT_TAG##*v}" | cut -d. -f2)

# Target layer version
if [ -z "$VERSION" ]; then
    printf "[Error] VERSION for layer version not specified.\n"
    printf "Exiting script...\n"
    exit 1
else
    printf "Layer version parsed: $VERSION\n"
fi

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
    if [[ "${_NODE_VERSIONS[$i]}" = "${NODE_VERSION}" ]]; then
       index=$i
    fi
done

printf "Getting External ID...\n"

EXTERNAL_ID=$(aws ssm get-parameter \
    --region us-east-1 \
    --name ci.datadog-lambda-js.externalid \
    --with-decryption \
    --query "Parameter.Value" \
    --out text)

printf "Assuming role...\n"

export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" \
    $(aws sts assume-role \
    --role-arn arn:aws:iam::425362996713:role/sandbox-layer-deployer  \
    --role-session-name ci.datadog-lambda-js \
    --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" \
    --external-id $EXTERNAL_ID \
    --output text))

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

printf "[$REGION] Starting publishing layers...\n"

aws_cli_node_version_key="${AWS_CLI_NODE_VERSIONS[$index]}"
layer_path="${LAYER_PATHS[$index]}"
layer="${LAYERS[$index]}"

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
