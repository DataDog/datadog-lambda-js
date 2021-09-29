#Retrieve the API KEY and status

DD_API_KEY=$1

# 0 means success
# 1 means failure
STATUS=$2

CURRENT_TIME=$(date +%s)

#Send the metric
curl -X POST \
-H "Content-type: application/json" \
-H "DD-API-KEY: ${DD_API_KEY}" \
-d "{ \"series\":[{\"metric\":\"serverless.integration_test.nodejs.status\",\"points\":[[$CURRENT_TIME, $STATUS]],\"tags\":[\"service:serverless-integration-test\"]}]}" \
'https://app.datadoghq.com/api/v1/series'