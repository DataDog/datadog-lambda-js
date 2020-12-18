#!/bin/bash
set -e

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ $BRANCH != "main" ]; then
    echo "Not on main, aborting"
    exit 1
fi

if [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo 'AWS_ACCESS_KEY_ID not set. Are you using aws-vault?'
    exit 1
fi

if [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo 'AWS_SECRET_ACCESS_KEY not set. Are you using aws-vault?'
    exit 1
fi

if [ -z "$AWS_SESSION_TOKEN" ]; then
    echo 'AWS_SESSION_TOKEN not set. Are you using aws-vault?'
    exit 1
fi

echo 'Checking Regions'
./scripts/list_layers.sh

yarn login

PACKAGE_VERSION=$(node -pe "require('./package.json').version")

echo 'Publishing to Node'
yarn build
yarn publish --new-version "$PACKAGE_VERSION"

echo 'Tagging Release'
git tag "v$PACKAGE_VERSION"
git push origin "refs/tags/v$PACKAGE_VERSION"

echo
echo 'Building layers...'
./scripts/build_layers.sh

echo
echo "Signing layers..."
./scripts/sign_layers.sh prod

echo
echo "Publishing layers..."
./scripts/publish_layers.sh
