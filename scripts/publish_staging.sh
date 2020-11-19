#!/bin/bash
set -e

./scripts/build_layers.sh
./scripts/publish_layers.sh sa-east-1
