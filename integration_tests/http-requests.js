const { datadog, sendDistributionMetric } = require("datadog-lambda-js");
const axios = require("axios");

const urls = ["https://ip-ranges.datadoghq.com", "https://ip-ranges.datadoghq.eu"];

async function handle(event, context) {
  const responsePayload = { message: "hello, dog!" };

  sendDistributionMetric("serverless.integration_test.execution", 1, "function:http-request");

  for (let index = 0; index < urls.length; index++) {
    await axios({ url: urls[index], method: 'get' });
  }

  console.log(`Snapshot test http requests successfully made to URLs: ${urls}`);

  return responsePayload;
}

module.exports.handle = datadog(handle);
