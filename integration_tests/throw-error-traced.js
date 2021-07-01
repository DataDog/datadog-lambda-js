const { datadog } = require("datadog-lambda-js");

async function handle(event, context) {
  throw new Error("Hello");
}
module.exports.handle = datadog(handle);
