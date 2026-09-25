const tracer = require("dd-trace");

// Both entry paths initialize dd-trace before loading this unwrapped handler.
// The child stays open past the real RIE deadline: only the timeout monitor's
// killAll() can flush it along with the error-tagged invocation span.
exports.handle = async function handle() {
  return tracer.trace("timeout.unfinished", async () => {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    return { statusCode: 200, body: "unreachable" };
  });
};
