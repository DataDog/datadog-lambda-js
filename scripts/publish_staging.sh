#!/bin/bash
set -e

./scripts/build_layers.sh
aws-vault exec  -- ./scripts/publish_layers.sh us-east-1
