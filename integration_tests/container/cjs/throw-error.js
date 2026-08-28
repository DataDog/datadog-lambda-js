// Ported as-is from integration_tests/throw-error-traced.js (the AWS suite's
// manual-wrap error case): a handler that always throws, wrapped with
// datadog() manually. Exercises thrown-error -> span error + rethrow through
// the RIE invoke path.
const { datadog } = require("datadog-lambda-js");

async function handle(event, context) {
  throw new Error("Hello");
}
module.exports.handle = datadog(handle);
