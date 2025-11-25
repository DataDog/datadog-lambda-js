#! /usr/bin/env bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2025 Datadog, Inc.
#
# USAGE: download the layer bundle from the build pipeline in gitlab. Use the
# Download button on the `layer bundle` job. This will be a zip file containing
# all of the required layers. Run this script as follows:
#
# ENVIRONMENT=[us1-staging-fed or us1-fed] [PIPELINE_LAYER_SUFFIX=optional-layer-suffix] [REGIONS=us-gov-west-1] ./scripts/publish_govcloud_layers.sh <layer-bundle.zip>
#
# protip: you can drag the zip file from finder into your terminal to insert
# its path.

set -e

NODE_VERSIONS=("18.12" "20.19" "22.11" "24.11")

LAYER_PACKAGE=$1

if [ -z "$LAYER_PACKAGE" ]; then
    printf "[ERROR]: layer package not provided\n"
    exit 1
fi

PACKAGE_NAME=$(basename "$LAYER_PACKAGE" .zip)
echo package name: $PACKAGE_NAME

if [ -z "$ENVIRONMENT" ]; then
    printf "[ERROR]: ENVIRONMENT not specified\n"
    exit 1
fi

if [ "$ENVIRONMENT" = "us1-staging-fed" ]; then
    AWS_VAULT_ROLE=sso-govcloud-us1-staging-fed-power-user

# this role looks like this in ~/.aws/config:
# [profile sso-govcloud-us1-staging-fed-power-user]
# sso_start_url=https://start.us-gov-home.awsapps.com/directory/d-9867188aeb
# sso_account_id=553727695824
# sso_role_name=power-user
# sso_region=us-gov-west-1
# region=us-gov-west-1

    export STAGE="sandbox"
    if [[ ! "$PACKAGE_NAME" =~ ^datadog_lambda_js-(signed-)?bundle-[0-9]+$ ]]; then
        echo "[ERROR]: Unexpected package name: $PACKAGE_NAME"
        exit 1
    fi

elif [ $ENVIRONMENT = "us1-fed" ]; then
    AWS_VAULT_ROLE=sso-govcloud-us1-fed-engineering

# this role looks like this in ~/.aws/config:
# [profile sso-govcloud-us1-fed-engineering]
# sso_start_url=https://start.us-gov-west-1.us-gov-home.awsapps.com/directory/d-98671fdc8b
# sso_account_id=002406178527
# sso_role_name=engineering
# sso_region=us-gov-west-1
# region=us-gov-west-1

    export STAGE="prod"
    if [[ ! "$PACKAGE_NAME" =~ ^datadog_lambda_js-signed-bundle-[0-9]+$ ]]; then
        echo "[ERROR]: Unexpected package name: $PACKAGE_NAME"
        exit 1
    fi

else
    printf "[ERROR]: ENVIRONMENT not supported, must be us1-staging-fed or us1-fed.\n"
    exit 1
fi

# Clean and recreate the .layers directory
echo "Cleaning .layers directory..."
rm -rf .layers
mkdir -p .layers

echo "Copying layer files to .layers directory..."
TEMP_DIR=$(mktemp -d)
unzip $LAYER_PACKAGE -d $TEMP_DIR
cp -v $TEMP_DIR/$PACKAGE_NAME/*.zip .layers/


AWS_VAULT_PREFIX="aws-vault exec $AWS_VAULT_ROLE --"

echo "Checking that you have access to the GovCloud AWS account"
$AWS_VAULT_PREFIX aws sts get-caller-identity


AVAILABLE_REGIONS=$($AWS_VAULT_PREFIX aws ec2 describe-regions | jq -r '.[] | .[] | .RegionName')

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

for region in $REGIONS
do
    echo "Starting publishing layers for region $region..."

    for NODE_VERSION in "${NODE_VERSIONS[@]}"; do
        echo "Publishing Layer for Node ${NODE_VERSION} in region ${region}"

        # Set environment variables for the publish script
        export REGION=$region
        export NODE_VERSION=$NODE_VERSION

        # Run the publish script with AWS credentials
        $AWS_VAULT_PREFIX .gitlab/scripts/publish_layers.sh
    done
done

echo "Done!"