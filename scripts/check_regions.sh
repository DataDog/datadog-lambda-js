#!/bin/bash

AWS_REGIONS=$(aws ec2 describe-regions | jq -r '.[] | .[] | .RegionName')
LAYER_NAMES=("Datadog-Node10-x" "Datadog-Node12-x")
FOUND_REGIONS_MISSING_LAYERS=false

for layer_name in "${LAYER_NAMES[@]}"; do
    for region in $AWS_REGIONS; do
        last_layer_arn=$(aws lambda list-layer-versions --layer-name $layer_name --region $region | jq -r ".LayerVersions | .[0] |  .LayerVersionArn")
        if [ "$last_layer_arn" == "null" ]; then
             echo "No layer found for $region, $layer_name"
             FOUND_REGIONS_MISSING_LAYERS=true
        fi
    done
done

if [ $FOUND_REGIONS_MISSING_LAYERS = true ]; then
    echo "Run ./add_new_region.sh <new_region> to add layers to the missing regions" 
fi