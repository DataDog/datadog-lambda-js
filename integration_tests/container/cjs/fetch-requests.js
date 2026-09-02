// fetch variant of http-requests.js. On Node 18+ the global fetch is
// undici, which dd-trace instruments through its undici plugin — a different
// injection path than the http/https plugin that patches axios in
// http-requests.js. Both paths must keep injecting the x-datadog-* trace
// context; this case pins the fetch one.
//
// Like http-requests.js this entry point is UNWRAPPED and runs through the
// npm redirect entry (dist/handler.handler) in the cjs-fetch-requests case,
// so dd-trace initializes before the user handler loads and the tracer's
// undici plugin does the injection. The mock echoes the request headers and
// this handler logs them, so the golden shows the injected downstream trace
// context (x-datadog-trace-id / x-datadog-parent-id, normalized to XXXX).
const { sendDistributionMetric } = require("datadog-lambda-js");

const urls = (process.env.MOCK_HTTP_URLS ||
  "https://ip-ranges.datadoghq.com,https://ip-ranges.datadoghq.eu"
).split(",");

async function handle(event, context) {
  const responsePayload = { message: "hello, dog!" };

  sendDistributionMetric("serverless.integration_test.execution", 1, "function:fetch-request");

  for (let index = 0; index < urls.length; index++) {
    const response = await fetch(urls[index]);
    const body = await response.json();
    console.log(`mock-http saw headers for ${urls[index]}: ${JSON.stringify(body.headers)}`);
  }

  console.log(`Snapshot test fetch requests successfully made to URLs: ${urls}`);

  return responsePayload;
}

module.exports.handle = handle;
