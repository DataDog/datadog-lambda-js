#!/bin/bash

yarn whoami
git checkout master
git pull

PACKAGE_VERSION="v${node -pe "require('./package.json').version"}"

git tag $PACKAGE_VERSION
git push origin refs/tags/$PACKAGE_VERSION
yarn publish
