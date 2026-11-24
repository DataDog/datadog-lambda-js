import Module from "node:module";

const { FAKE_TRACER_PATH, HANDLER_TEST_ENTRY } = process.env;

globalThis.registrationEvents = [];

// Resolve dd-trace to the fake tracer.
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === "dd-trace" ? FAKE_TRACER_PATH : resolveFilename.call(this, request, ...rest);
};

// Node.js removes module.register in nodejs/node#67090.
delete Module.register;

const { handler } = await import(HANDLER_TEST_ENTRY);
const result = await handler({}, { functionName: "esm-registration-test", getRemainingTimeInMillis: () => 30_000 });

process.stdout.write(`\n${JSON.stringify({ events: globalThis.registrationEvents, result })}\n`);
