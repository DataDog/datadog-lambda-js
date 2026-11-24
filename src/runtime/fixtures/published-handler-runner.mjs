import { once } from "node:events";
import Module from "node:module";

const handlerEntry = process.env.HANDLER_TEST_ENTRY;
if (handlerEntry === undefined) {
  throw new Error("HANDLER_TEST_ENTRY is required");
}
if (process.send === undefined) {
  throw new Error("The published handler runner requires an IPC channel");
}

let loaderRegistrations = 0;
for (const name of ["register", "registerHooks"]) {
  const register = Module[name];
  if (typeof register === "function") {
    Module[name] = function (...args) {
      loaderRegistrations++;
      return register(...args);
    };
  }
}
Module.syncBuiltinESMExports();

const { handler } = await import(handlerEntry);
const result = await handler(
  {
    DurableExecutionArn:
      "arn:aws:lambda:us-east-1:123456789012:function:loader-instrumentation-test:$LATEST/durable-execution/test/test-id",
    CheckpointToken: "checkpoint-token",
    InitialExecutionState: { Operations: [] },
  },
  {
    callbackWaitsForEmptyEventLoop: false,
    functionName: "loader-instrumentation-test",
    functionVersion: "$LATEST",
    invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789012:function:loader-instrumentation-test",
    memoryLimitInMB: "1024",
    awsRequestId: "test-request",
    logGroupName: "/aws/lambda/loader-instrumentation-test",
    logStreamName: "2026/08/28/[$LATEST]test",
    getRemainingTimeInMillis() {
      return 30_000;
    },
  },
);

const exitSignal = once(process, "message");
process.send({
  loaderRegistrations,
  result,
});
await exitSignal;
process.disconnect();
