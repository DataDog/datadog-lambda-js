// Ported from integration_tests/http-requests.js with one seam adaptation:
// the AWS suite hits the real ip-ranges.datadoghq.com/.eu endpoints; the
// local harness is hermetic, so URLs come from MOCK_HTTP_URLS (set by run.sh
// to the mock-http container on the case's docker network). The default keeps
// this file runnable outside the harness.
//
// This entry point is UNWRAPPED and runs through the npm redirect entry
// (dist/handler.handler) in the cjs-http-requests case. Redirect mode
// initializes dd-trace first, so the tracer's http plugin patches axios and
// the mock echo below shows the injected x-datadog-* headers in the golden.
// The manual-wrap variant of the AWS suite's function — which exercises the
// library's own patchHttp fallback instead — lives in http-requests-manual.js
// and runs as the manual-http-requests case.
//
// The mock echoes the request headers it received, and this handler logs them,
// so both goldens show the injected downstream trace context
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
