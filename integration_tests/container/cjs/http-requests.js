// Ported from integration_tests/http-requests.js with two seam adaptations:
//   1. The AWS suite hits the real ip-ranges.datadoghq.com/.eu endpoints; the
//      local harness is hermetic, so URLs come from MOCK_HTTP_URLS (set by
//      run.sh to the mock-http container on the case's docker network). The
//      default keeps this file runnable outside the harness.
//   2. The handler is left UNWRAPPED and runs through the npm redirect entry
//      (dist/handler.handler), because the manual-wrap path never produces
//      traces without a userland dd-trace init — true in the AWS suite too
//      (its http-requests snapshots contain no trace JSON). Redirect mode
//      initializes the tracer first, so the http plugin patches axios and the
//      mock echo below shows the injected x-datadog-* headers in the golden.
//
// The mock echoes the request headers it received, and this handler logs them,
// so the golden shows the injected downstream trace context
// (x-datadog-trace-id / x-datadog-parent-id, normalized to XXXX).
const { sendDistributionMetric } = require("datadog-lambda-js");
const axios = require("axios");

const urls = (process.env.MOCK_HTTP_URLS ||
  "https://ip-ranges.datadoghq.com,https://ip-ranges.datadoghq.eu"
).split(",");

async function handle(event, context) {
  const responsePayload = { message: "hello, dog!" };

  sendDistributionMetric("serverless.integration_test.execution", 1, "function:http-request");

  for (let index = 0; index < urls.length; index++) {
    const response = await axios({ url: urls[index], method: "get" });
    console.log(`mock-http saw headers for ${urls[index]}: ${JSON.stringify(response.data.headers)}`);
  }

  console.log(`Snapshot test http requests successfully made to URLs: ${urls}`);

  return responsePayload;
}

module.exports.handle = handle;

