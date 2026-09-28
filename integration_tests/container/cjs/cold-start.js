// Real synchronous module loads, observed through dd-trace's module-load channels.
require("./cold-start-parent");
require("/opt/cold-start-probe");
require("/var/runtime/cold-start-probe");

let invocation = 0;
exports.handle = (_event, context) => {
  invocation++;
  // Lazy loading on a warm invocation is supported: it must be traced once,
  // parented to that invocation, and not replayed on subsequent invocations.
  if (invocation === 2) require("./cold-start-warm");
  process.stdout.write(
    JSON.stringify({
      coldStartInvocation: {
        requestId: context.awsRequestId,
        invocation,
        initializationType: process.env.AWS_LAMBDA_INITIALIZATION_TYPE,
      },
    }) + "\n",
  );
  return { message: "hello, dog!" };
};
