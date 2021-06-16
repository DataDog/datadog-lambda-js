#!/bin/bash

# Usage: VERSION=5 aws-vault exec sandbox-acccount-admin -- publish_layers.sh
set -e

./scripts/build_layers.sh
./scripts/sign_layers.sh sandbox
VERSION=$VERSION REGIONS=sa-east-1 ./scripts/publish_layers.sh
