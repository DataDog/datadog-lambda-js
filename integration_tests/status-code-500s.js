const tracer = require("dd-trace").init();
const { datadog } = require("datadog-lambda-js");

async function handle(event, context) {
  const span = tracer.scope().active();
  span.setTag("fake_tag", "fake_value")
  return {
    "statusCode": 501,
    "body": {}
  };
}

module.exports.handle = datadog(handle);