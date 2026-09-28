"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const [mode, count] = process.argv.slice(2);
const expected = Number(count);
assert.ok(["enabled", "skip", "threshold", "disabled", "provisioned", "managed"].includes(mode), "known mode");
assert.ok(Number.isInteger(expected) && expected >= 3, "at least three invocations required");
const spans = [];
const starts = [];
const reports = [];
const fixtures = [];
const calls = [];
// Inspect the unnormalized exports across every payload: a "some trace matches"
// check would miss duplicate invocation spans or replayed module spans.
for (const line of fs.readFileSync(0, "utf8").split("\n")) {
  const start = /^START RequestId: (\S+)/.exec(line);
  const report = /^REPORT RequestId: (\S+)/.exec(line);
  if (start) starts.push(start[1]);
  if (report) reports.push(report[1]);
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    continue;
  }
  if (Array.isArray(record.traces)) spans.push(...record.traces.flat());
  if (record.coldStartFixture) fixtures.push(record.coldStartFixture);
  if (record.coldStartInvocation) calls.push(record.coldStartInvocation);
}
assert.equal(starts.length, expected, "START count");
assert.equal(new Set(starts).size, expected, "unique invocation IDs");
assert.deepEqual(reports, starts, "REPORT IDs match invocations");
assert.deepEqual(
  calls.map((c) => c.requestId),
  starts,
  "fixture ran for every invocation",
);
assert.deepEqual(
  calls.map((c) => c.invocation),
  starts.map((_, i) => i + 1),
  "same warm environment reused",
);
const expectedFixtures = [
  "/var/task/cold-start-parent.js",
  "/var/task/cold-start-probe.js",
  "/var/task/cold-start-skip.js",
  "/var/task/cold-start-skipped-child.js",
  "/opt/cold-start-probe.js",
  "/var/runtime/cold-start-probe.js",
  "/var/task/cold-start-warm.js",
];
// Load markers prove suppression/filter tests actually executed the same modules.
assert.deepEqual(fixtures.slice().sort(), expectedFixtures.slice().sort(), "known modules really loaded exactly once");
const lambdas = spans.filter((s) => s.name === "aws.lambda");
assert.equal(lambdas.length, expected, "exactly one Lambda span per invocation across all payloads");
const invocations = starts.map((id) => {
  const matches = lambdas.filter((s) => s.meta?.request_id === id);
  assert.equal(matches.length, 1, "one Lambda span for request ID");
  assert.equal(matches[0].error, 0, "successful invocation");
  return matches[0];
});
const cold = spans.filter((s) => s.name === "aws.lambda.load" || s.name.startsWith("aws.lambda.require"));
const suppressed = ["disabled", "provisioned", "managed"].includes(mode);
if (mode === "provisioned" || mode === "managed") {
  const value = mode === "managed" ? "lambda-managed-instances" : "provisioned-concurrency";
  assert.ok(
    calls.every((c) => c.initializationType === value),
    "runtime actually used the requested initialization mode",
  );
}
if (suppressed) {
  assert.equal(cold.length, 0, "cold-start tracing suppressed, including warm module loads");
} else {
  const [first, second] = invocations;
  const loads = cold.filter((s) => s.name === "aws.lambda.load");
  assert.equal(loads.length, 1, "exactly one load span; none on warm invocations");
  const load = loads[0];
  const key = (s) => `${s.trace_id}/${s.span_id}`;
  const byId = new Map(spans.map((s) => [key(s), s]));
  assert.equal(byId.size, spans.length, "no duplicated exported span identities");
  const parent = (s) => byId.get(`${s.trace_id}/${s.parent_id}`);
  assert.equal(load.trace_id, first.trace_id, "load belongs to first invocation trace");
  assert.equal(load.parent_id, parent(first)?.span_id || first.span_id, "load parent is inferred span or invocation");
  assert.ok(load.duration >= 0 && load.start + load.duration <= first.start + 2e6, "load ends before invocation start");
  const requires = cold.filter((s) => s.name.startsWith("aws.lambda.require"));
  if (mode === "threshold") {
    assert.equal(requires.length, 0, "high min-duration filters require spans but keeps the load span");
  } else {
    // Only the deliberately slow fixture modules have fixed cardinality. Other
    // modules can cross the duration threshold differently on each runtime/CPU.
    assert.ok(requires.length > 0, "module-load capture is active");
    for (const span of requires) {
      const filename = span.meta?.filename;
      assert.equal(typeof filename, "string", "require span filename");
      const operation = filename.startsWith("/opt/")
        ? "aws.lambda.require_layer"
        : filename.startsWith("/var/runtime/")
        ? "aws.lambda.require_runtime"
        : filename.includes("/")
        ? "aws.lambda.require"
        : "aws.lambda.require_core_module";
      assert.equal(span.name, operation, "operation matches module path classification");
      assert.ok(Number.isFinite(span.duration) && span.duration >= 0, "valid require duration");
      let ancestor = span;
      const seen = new Set();
      while (ancestor && ancestor !== load && !invocations.includes(ancestor)) {
        assert.ok(!seen.has(key(ancestor)), "acyclic load tree");
        seen.add(key(ancestor));
        ancestor = parent(ancestor);
      }
      assert.ok(ancestor === load || invocations.includes(ancestor), "require linked to load or invocation");
    }
    for (const filename of expectedFixtures) {
      const matches = requires.filter((s) => s.meta.filename === filename);
      const skipped = mode === "skip" && /cold-start-skip(?:ped-child)?\.js$/.test(filename);
      assert.equal(matches.length, skipped ? 0 : 1, `fixture span cardinality: ${filename}`);
      if (skipped) continue;
      const span = matches[0];
      const warm = filename.endsWith("cold-start-warm.js");
      let ancestor = span;
      while (ancestor && ancestor !== load && !invocations.includes(ancestor)) ancestor = parent(ancestor);
      assert.equal(ancestor, warm ? second : load, "cold/warm fixture parent and no replay on later invocations");
      if (!warm) assert.ok(span.start + span.duration <= first.start + 2e6, "init module finishes before invocation");
      else assert.ok(span.start >= second.start - 2e6, "lazy module loads during second invocation");
    }
  }
}
console.log(`Ok: cold-start ${mode} structure across ${expected} invocations`);
