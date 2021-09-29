if [ -z $GITHUB_REF ]; then
  echo "GITHUB_REF is not set, not sending the metric"
  exit 0
fi

if [ "$GITHUB_REF" != "refs/heads/main" ]; then
  echo "Not on the main branch, not sending the metric"
  exit 0
fi

#Retrieve the status
# 0 means success
# 1 means failure
STATUS=$1

API_KEY=$2
CURRENT_TIME=$(date +%s)

#Send the metric
curl -H "Content-type: application/json" \
-H "DD-API-KEY: ${API_KEY}" \
-d "{ \"series\" :
         [{\"metric\":\"serverless.integration_test.nodejs.status\",
          \"points\":[[$CURRENT_TIME, $STATUS]],
          \"type\":\"gauge\",
          \"tags\":[\"service:serverless-integration-test\"]}
        ]
    }" \
'https://app.datadoghq.com/api/v1/series'