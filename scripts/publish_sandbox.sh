#!/bin/bash

# Usage: VERSION=5 aws-vault exec sso-serverless-sandbox-account-admin -- publish_sandbox.sh
set -e

if [ -z "$VERSION" ]; then
    echo "Version not specified."
    echo "Please specify the desired layer version (e.g. 5)."
    exit 1
fi

./scripts/build_layers.sh
VERSION=$VERSION ./scripts/publish_layers.sh

# Automatically create PR against github.com/DataDog/documentation
# If you'd like to test, please uncomment the below line
# VERSION=$VERSION LAYER=datadog-lambda-js ./scripts/create_documentation_pr.sh
