// Assertions for scripts/test_npm_package.sh, run after that script cds into the
// throwaway consumer project. Resolves packages from cwd, not this repo.
//
// USAGE: node scripts/assert_npm_package.js <no-tracer|with-tracer>

"use strict";

function consumerRequire(name) {
  return require(require.resolve(name, { paths: [process.cwd()] }));
}

const mode = process.argv[2];
if (mode === "no-tracer") {
  assertNoTracer();
} else if (mode === "with-tracer") {
  try {
    assertWithTracer();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
} else {
  console.error("Usage: node scripts/assert_npm_package.js <no-tracer|with-tracer>");
  process.exit(1);
}

function assertNoTracer() {
  const { datadog, sendDistributionMetric } = consumerRequire("datadog-lambda-js");
  if (typeof datadog !== "function" || typeof sendDistributionMetric !== "function") {
    throw new Error("datadog-lambda-js did not export its public API");
  }
  const { TracerWrapper } = consumerRequire("datadog-lambda-js/dist/trace/tracer-wrapper");
  const wrapper = new TracerWrapper();
  if (wrapper.isTracerAvailable) {
    throw new Error("A tracer was reported as available with no dd-trace installed");
  }
  if (wrapper.tracerVersion !== "") {
    throw new Error(`Expected no tracer version, got ${wrapper.tracerVersion}`);
  }
}

function assertWithTracer() {
  consumerRequire("dd-trace").init();
  const expected = consumerRequire("dd-trace/package.json").version;
  const { TracerWrapper } = consumerRequire("datadog-lambda-js/dist/trace/tracer-wrapper");
  const wrapper = new TracerWrapper();
  if (!wrapper.isTracerAvailable) {
    throw new Error("dd-trace is installed and initialized but was not picked up");
  }
  if (wrapper.tracerVersion !== expected) {
    throw new Error(`Expected tracer version ${expected}, got ${wrapper.tracerVersion}`);
  }
}
