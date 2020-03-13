const tracer = require("dd-trace").init();

const { datadog, sendDistributionMetric } = require("datadog-lambda-js");

// Minimal example of tracing to reduce flakiness
async function handle(event, context) {
  const responsePayload = { message: "hello, dog!" };

  sendDistributionMetric("serverless.integration_test.execution", 1, "function:process-input-traced");

  return responsePayload;
}

module.exports.handle = datadog(handle);
