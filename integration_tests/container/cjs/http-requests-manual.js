// Manual-wrap companion to http-requests.js, run as the manual-http-requests
// case — the exact shape of the AWS suite's http-requests function
// (manual datadog() wrap, no userland dd-trace init).
//
// With no tracer initialized, TraceListener falls back to the library's own
// patchHttp (src/trace/patch-http.ts), which wraps http/https and logs
// "HTTP GET <url> TraceHeaders: [...]" per request. On real Lambda the
// injected headers come from the platform's pass-through _X_AMZN_TRACE_ID;
// under RIE that variable cannot be emulated (the RIC owns it), so the
// golden pins the empty-context form (TraceHeaders: []) plus the mock echo
// of the exact header set sent. The path under test — patchHttp wiring —
// fails this golden the moment it stops wrapping or logging; the
// context-dependent header values are pinned by the patch-http unit tests
// and the AWS suite.
const { datadog } = require("datadog-lambda-js");
const { handle } = require("./http-requests");

module.exports.handle = datadog(handle);
