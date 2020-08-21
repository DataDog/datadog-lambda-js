const { datadog, sendDistributionMetric } = require("datadog-lambda-js");
const axios = require("axios");

async function handle(event, context) {
  const responsePayload = { message: "hello, dog!" };

  sendDistributionMetric("serverless.integration_test.execution", 1, "function:http-request");

  try {
    await axios({ url: 'https://httpstat.us/400', method: 'get' });
  } catch (err) {
    return responsePayload;
  }

  console.log('Snapshot test http requests successfully made to URLs: https://httpstat.us/400');

  return responsePayload;
}

module.exports.handle = process.env.WITH_PLUGIN ? handle : datadog(handle);
