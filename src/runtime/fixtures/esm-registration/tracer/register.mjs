// Like dd-trace's register.mjs, finish asynchronously: require() cannot load it, and the handler must wait for it.
await Promise.resolve();

if (process.env.FAIL_REGISTRATION === "true") {
  throw new Error("registration failed");
}

globalThis.registrationEvents.push("register.mjs");
