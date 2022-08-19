const tracer = require("dd-trace").init();
const { datadog } = require("datadog-lambda-js");

async function handle(event, context) {
  const span = tracer.scope().active();
  return {
    "statusCode": 500,
    "body": {}
  };
}

module.exports.handle = datadog(handle);