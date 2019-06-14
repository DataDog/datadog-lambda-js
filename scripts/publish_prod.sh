#!/bin/bash
set -e

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ $BRANCH != "master" ]; then
    echo "Not on master, aborting"
    exit 1
fi

npm whoami

./scripts/run_tests.sh

PACKAGE_VERSION=$(node -pe "require('./package.json').version")

yarn build
yarn publish --version "$PACKAGE_VERSION"

git tag "v$PACKAGE_VERSION"
git push origin "refs/tags/v$PACKAGE_VERSION"

./scripts/build_layers.sh
aws-vault exec prod-engineering -- ./scripts/publish_layers.sh
