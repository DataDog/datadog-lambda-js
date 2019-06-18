#!/bin/bash
set -e

./scripts/build_layers.sh
./scripts/publish_layers.sh us-east-1
