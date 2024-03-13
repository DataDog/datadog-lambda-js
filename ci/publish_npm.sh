#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2023 Datadog, Inc.

set -e

NPM_TOKEN=$(aws ssm get-parameter \
    --region us-east-1 \
    --name "ci.datadog-lambda-js.npm-token" \
    --with-decryption \
    --query "Parameter.Value" \
    --out text)

echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" >> .npmrc

if [ -z "$CI_COMMIT_TAG" ]; then
    printf "[Error] No CI_COMMIT_TAG found.\n"
    printf "Exiting script...\n"
    # exit 1
else
    printf "Tag found in environment: $CI_COMMIT_TAG\n"
fi

echo 'Publishing to NPM'
if [ -d "./dist" ]; then
    rm -rf ./dist
fi
npm run build
cp ./dist/handler.cjs ./dist/handler.js
npm publish --dry-run
