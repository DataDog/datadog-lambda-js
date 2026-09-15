// Callback-style handler — (event, context, callback) instead of async —
// manually wrapped with datadog(). The migration spike broke exactly this
// seam: the new host's tracePromise wrapper replaced promisifiedHandler's
// call site, so callback handlers returned null to API Gateway. handler.spec
// pins the unit behavior; this case pins the same path end to end through
// the RIE invoke. The setTimeout makes the completion genuinely asynchronous
// so the wrapper cannot mistake it for a sync return.
const { datadog } = require("datadog-lambda-js");

function handle(event, context, callback) {
  setTimeout(() => {
    callback(null, { message: "hello, dog!" });
  }, 10);
}

module.exports.handle = datadog(handle);
