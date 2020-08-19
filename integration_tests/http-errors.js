const { datadog, sendDistributionMetric } = require("datadog-lambda-js");
const https = require("https");

async function handle(event, context) {
  const responsePayload = { message: "hello, dog!" };

  sendDistributionMetric("serverless.integration_test.execution", 1, "function:http-request");

  await httpsGet('httpstat.us', '/400');

  console.log('Snapshot test http requests successfully made to URLs: httpstat.us/400');

  return responsePayload;
}

async function httpsGet(url, path) {
  const requestOptions = {
    host: url,
    method: "GET",
    protocol: "https:",
    path,
  };

  return new Promise(function(resolve, reject) {
    const request = https.request(requestOptions);

    request.on("response", (response) => {
      return resolve(response);
    });
    request.on("error", (error) => {
      return reject(error);
    });

    request.end();
  });
}

module.exports.handle = process.env.WITH_PLUGIN ? handle : datadog(handle);
