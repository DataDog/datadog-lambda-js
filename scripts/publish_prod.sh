#!/bin/bash

# Use with `./publish_prod.sh <DESIRED_NEW_VERSION>

set -e

# Ensure on main, and pull the latest
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ $BRANCH != "main" ]; then
    echo "Not on main, aborting"
    exit 1
else
    echo "Updating main"
    git pull origin main
fi

# Ensure no uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "Detected uncommitted changes, aborting"
    exit 1
fi

# Read the new version
if [ -z "$1" ]; then
    echo "Must specify a desired version number"
    exit 1
elif [[ ! $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Must use a semantic version, e.g., 3.1.4"
    exit 1
else
    NEW_VERSION=$1
fi

echo "Ensure you have access to the datadog NPM service account"
yarn login

echo "Ensure you have access to the AWS GovCloud account"
saml2aws login -a govcloud-us1-fed-human-engineering
AWS_PROFILE=govcloud-us1-fed-human-engineering aws sts get-caller-identity

echo "Ensure you have access to the production AWS account"
aws-vault exec prod-engineering -- aws sts get-caller-identity

CURRENT_VERSION=$(npm view datadog-lambda-js version)
LAYER_VERSION=$(echo $NEW_VERSION | cut -d '.' -f 2)

read -p "Ready to update the library version from $CURRENT_VERSION to $NEW_VERSION and publish layer version $LAYER_VERSION (y/n)?" CONT
if [ "$CONT" != "y" ]; then
    echo "Exiting"
    exit 1
fi

# Update the version without committing
yarn version --no-git-tag-version --new-version $NEW_VERSION

echo
echo 'Building layers...'
./scripts/build_layers.sh

echo
echo "Signing layers for commercial AWS regions"
aws-vault exec prod-engineering -- ./scripts/sign_layers.sh prod

echo
echo "Publishing layers to commercial AWS regions"
VERSION=$LAYER_VERSION aws-vault exec prod-engineering --no-session -- ./scripts/publish_layers.sh

echo "Publishing layers to GovCloud AWS regions"
saml2aws login -a govcloud-us1-fed-human-engineering
VERSION=$LAYER_VERSION AWS_PROFILE=govcloud-us1-fed-human-engineering ./scripts/publish_layers.sh

read -p "Ready to publish $NEW_VERSION to NPM (y/n)?" CONT
if [ "$CONT" != "y" ]; then
    echo "Exiting"
    exit 1
fi

echo 'Publishing to NPM'
yarn build
yarn publish --new-version "$NEW_VERSION"

echo
echo 'Publishing updates to github'
git commit package.json -m "Bump version to ${NEW_VERSION}"
git push origin main
git tag "v$NEW_VERSION"
git push origin "refs/tags/v$NEW_VERSION"

echo
echo "Now create a new release with the tag v${NEW_VERSION} created"
echo "https://github.com/DataDog/datadog-lambda-js/releases/new?tag=v$NEW_VERSION&title=v$NEW_VERSION"

# Open a PR to the documentation repo to automatically bump layer version
VERSION=$VERSION LAYER=datadog-lambda-js ./scripts/create_documentation_pr.sh
