const { datadog, sendDistributionMetric } = require("datadog-lambda-js");
const https = require("https");

const urls = ["ip-ranges.datadoghq.com", "ip-ranges.datadoghq.eu"];

async function handle(event, context) {
  const responsePayload = { message: "hello, dog!" };

  sendDistributionMetric("serverless.integration_test.execution", 1, "function:http-request");

  for (let index = 0; index < urls.length; index++) {
    await httpsGet(urls[index]);
  }

  console.log(`Snapshot test http requests successfully made to URLs: ${urls}`);

  return responsePayload;
}

async function httpsGet(url) {
  const requestOptions = {
    host: url,
    method: "GET",
    protocol: "https:",
    path: "/",
  };

  return new Promise(function(resolve, reject) {
    const request = https.request(requestOptions);

    request.on("response", (response) => {
      resolve(response);
    });
    request.on("error", (error) => {
      reject(error);
    });

    request.end();
  });
}

module.exports.handle = datadog(handle);
