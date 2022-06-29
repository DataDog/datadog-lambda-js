const { datadog } = require("datadog-lambda-js");

async function handle(event, context) {
  return {
    statusCode: 500,
    body: {}
  };
}
module.exports.handle = datadog(handle);
