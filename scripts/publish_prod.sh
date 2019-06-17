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

echo 'Publishing to Node'
yarn build
yarn publish --version "$PACKAGE_VERSION"

echo 'Tagging Release'
git tag "v$PACKAGE_VERSION"
git push origin "refs/tags/v$PACKAGE_VERSION"

echo 'Publishing Lambda Layer'
./scripts/build_layers.sh
aws-vault exec prod-engineering -- ./scripts/publish_layers.sh
