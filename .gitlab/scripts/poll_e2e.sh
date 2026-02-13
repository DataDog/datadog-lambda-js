curl -OL "binaries.ddbuild.io/dd-source/authanywhere/LATEST/authanywhere-linux-amd64" && mv "authanywhere-linux-amd64" /bin/authanywhere && chmod +x /bin/authanywhere

BTI_CI_API_TOKEN=$(authanywhere --audience rapid-devex-ci)

BTI_RESPONSE= $(curl --silent --request GET \
    --header "$BTI_CI_API_TOKEN" \
    --header "Content-Type: application/vnd.api+json" \
    "https://bti-ci-api.us1.ddbuild.io/internal/ci/gitlab/token?owner=DataDog&repository=datadog-lambda-js")

GITLAB_TOKEN=$(echo "$BTI_RESPONSE" | jq -r '.token // empty') 

if [ -z "$GITLAB_TOKEN" ]; then
echo "Error: Failed to get GitLab token from BTI CI API. Response: $BTI_RESPONSE"
exit 1
fi

URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/pipelines/${CI_PIPELINE_ID}/bridges"

echo "Fetching E2E job status from: $URL"

while true; do
    RESPONSE=$(curl -s --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" "$URL")
    echo $RESPONSE
    E2E_JOB_STATUS=$(echo "$RESPONSE" | jq -r '.[] | select(.name=="e2e-test") | .downstream_pipeline.status')
    echo -n "E2E job status: $E2E_JOB_STATUS, "
    if [ "$E2E_JOB_STATUS" == "success" ]; then
        echo "✅ E2E tests completed successfully"
        exit 0
    elif [ "$E2E_JOB_STATUS" == "failed" ]; then
        echo "❌ E2E tests failed"
        exit 1
    elif [ "$E2E_JOB_STATUS" == "running" ]; then
        echo "⏳ E2E tests are still running, retrying in 1 minute..."
    elif [ "$E2E_JOB_STATUS" == "canceled" ]; then
        echo "🚫 E2E tests were canceled"
        exit 1
    elif [ "$E2E_JOB_STATUS" == "skipped" ]; then
        echo "⏭️ E2E tests were skipped"
        exit 0
    else
        echo "❓ Unknown E2E test status: $E2E_JOB_STATUS, retrying in 1 minute..."
    fi
    sleep 60
done