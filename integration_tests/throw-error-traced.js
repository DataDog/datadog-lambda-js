const { datadog } = require("datadog-lambda-js");

async function handle(event, context) {
    throw new Error("Hello")
}
module.exports.handle = process.env.WITH_PLUGIN ? handle : datadog(handle);
