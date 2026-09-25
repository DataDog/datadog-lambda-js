"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

// Check raw identities and complete trace payloads before the shared golden
// normalizer removes IDs or the runner sorts lines. A "some trace matches"
// assertion cannot catch two invocation spans exported in different payloads.
const expected = Number(process.argv[2]);
assert.ok(Number.isInteger(expected) && expected > 0, "expected invocation count is required");
const raw = fs.readFileSync(0, "utf8");
const lines = raw.trimEnd().split("\n");
const starts = new Map();
const reports = new Map();
const spans = [];

for (const [index, line] of lines.entries()) {
  const start = /^START RequestId: (\S+)/.exec(line);
  const report = /^REPORT RequestId: (\S+)/.exec(line);
  if (start) {
    assert.ok(!starts.has(start[1]), "duplicate START request ID");
    starts.set(start[1], index);
  }
  if (report) {
    assert.ok(!reports.has(report[1]), "duplicate REPORT request ID");
    reports.set(report[1], index);
  }
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    continue;
  }
  if (Array.isArray(record.traces)) {
    for (const trace of record.traces) {
      for (const span of trace) spans.push({ span, index });
    }
  }
}

assert.equal(starts.size, expected, "START count");
assert.equal(reports.size, expected, "REPORT count");
assert.equal(lines.filter((line) => line.includes("Reset initiated: Timeout")).length, expected, "timeout resets");
assert.equal(lines.filter((line) => line.includes("Sending SIGKILL to runtime-")).length, expected, "runtime kills");

const invocations = spans.filter(({ span }) => span.name === "aws.lambda");
const children = spans.filter(({ span }) => span.name === "timeout.unfinished");
assert.equal(invocations.length, expected, "exactly one Lambda span per invocation across all trace payloads");
assert.equal(children.length, expected, "killAll must flush every unfinished child");
for (const [requestId, startIndex] of starts) {
  const matching = invocations.filter(({ span }) => span.meta?.request_id === requestId);
  assert.equal(matching.length, 1, `Lambda span count for ${requestId}`);
  const { span, index } = matching[0];
  assert.equal(span.error, 1, "invocation must be marked as an error");
  assert.equal(span.meta["error.type"], "Impending Timeout");
  assert.equal(span.meta["error.message"], "Datadog detected an impending timeout");
  assert.ok(index > startIndex && index < reports.get(requestId), "span exported before runtime timeout REPORT");
  // The configured guard fires ~1.5s in, allowing 1s of scheduling overhead.
  // Expected around 1.5s; allow generous tolerance while rejecting immediate firing.
  assert.ok(
    span.duration >= 0.5e9 && span.duration < 2.5e9,
      `span must honor the 3500ms flush deadline: got ${span.duration / 1e9}s`,
  );
  const matchingChildren = children.filter(
    ({ span: child }) => child.trace_id === span.trace_id && child.parent_id === span.span_id,
  );
  assert.equal(matchingChildren.length, 1, "unfinished child must stay in its invocation's trace");
  const child = matchingChildren[0];
  assert.equal(child.span.error, 0, "timeout must decorate the invocation rather than the child");
  assert.ok(
    child.index > startIndex && child.index < reports.get(requestId),
    "child exported before runtime timeout REPORT",
  );
}

// Only RIE's new timeout diagnostics need extra normalization. Keep every
// record, severity, and error value; replace volatile runtime/PID/request IDs
// and canonicalize Go's nondeterministic order of these two log fields.
process.stdout.write(
  lines
    .map((line) => {
      if (!/^\d{2} \w{3} \d{4} .*\[(?:INFO|ERROR|WARNING)\] \(rapid\)/.test(line)) return line;
      return line
        .replace(/^\d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2},\d{3} /, "XXXX ")
        .replace(/InvokeID=[0-9a-f-]+/g, "InvokeID=XXXX")
        .replace(/runtime-\d+\(\d+\)/g, "runtime-XX(XX)")
        .replace(
          "Invoke failed error=errResetReceived InvokeID=XXXX",
          "Invoke failed InvokeID=XXXX error=errResetReceived",
        );
    })
    .join("\n") + "\n",
);
