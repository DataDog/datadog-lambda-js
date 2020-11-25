#!/bin/bash
set -e

./scripts/build_layers.sh
./scripts/sign_layers.sh sa-east-1
./scripts/publish_layers.sh sa-east-1
