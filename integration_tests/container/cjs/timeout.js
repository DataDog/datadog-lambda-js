// Manual wrapping does not initialize the tracer. Load it first so its
// datadog-lambda-js hook installs the pre-migration timeout monitor.
require("dd-trace").init();
const { datadog } = require("datadog-lambda-js");
const { handle } = require("./timeout-handler");

module.exports.handle = datadog(handle);
