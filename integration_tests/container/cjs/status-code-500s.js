// Ported as-is from integration_tests/status-code-500s.js (the AWS suite's
// API Gateway 500 case): returns statusCode 500 so the span gets the error
// tag and the aws.lambda.enhanced.errors metric is emitted.
const tracer = require("dd-trace").init();
const { datadog } = require("datadog-lambda-js");

async function handle(event, context) {
  const span = tracer.scope().active();
  return {
    "statusCode": 500,
    "body": {}
  };
}

module.exports.handle = datadog(handle);
