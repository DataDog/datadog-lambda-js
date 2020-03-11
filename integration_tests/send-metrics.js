const { datadog, getTraceHeaders } = require("datadog-lambda-js");

async function handle(event, context) {
  console.log("This is an example log line");

  return "hello, dog!";
}

module.exports.handle = datadog(handle);
