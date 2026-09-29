"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");

function fixture() {
  const invocation = {
    name: "aws.lambda",
    trace_id: "trace",
    span_id: "lambda",
    parent_id: "0",
    error: 1,
    duration: 1.5e9,
    meta: {
      request_id: "abc-def",
      "error.type": "Impending Timeout",
      "error.message": "Datadog detected an impending timeout",
    },
  };
  const child = {
    name: "timeout.unfinished",
    trace_id: "trace",
    span_id: "child",
    parent_id: "lambda",
    error: 0,
  };
  return { invocation, child };
}

function rawLog(payloads, { late = false, kill = true } = {}) {
  const records = payloads.map((spans) => JSON.stringify({ traces: [spans] }));
  const report = "REPORT RequestId: abc-def Duration: 5000.00 ms";
  return (
    [
      "START RequestId: abc-def Version: $LATEST",
      ...(late ? [report, ...records] : [...records, report]),
      "25 Sep 2026 02:03:57,172 [ERROR] (rapid) Invoke failed error=errResetReceived InvokeID=abc-def",
      "25 Sep 2026 02:03:57,173 [WARNING] (rapid) Reset initiated: Timeout",
      ...(kill ? ["25 Sep 2026 02:03:57,173 [INFO] (rapid) Sending SIGKILL to runtime-1(28)."] : []),
    ].join("\n") + "\n"
  );
}

function check(input) {
  return spawnSync(process.execPath, [path.join(__dirname, "check-timeout-logs.js"), "1"], {
    input,
    encoding: "utf8",
  });
}

test("accepts complete exports and normalizes only volatile RIE diagnostics", () => {
  const { invocation, child } = fixture();
  const result = check(rawLog([[invocation], [child]]));
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(JSON.stringify({ traces: [[invocation]] })), "trace payload unchanged");
  assert.ok(result.stdout.includes("XXXX [ERROR] (rapid) Invoke failed InvokeID=XXXX error=errResetReceived"));
  assert.ok(result.stdout.includes("XXXX [WARNING] (rapid) Reset initiated: Timeout"));
  assert.ok(result.stdout.includes("XXXX [INFO] (rapid) Sending SIGKILL to runtime-XX(XX)."));
});

test("rejects a second Lambda span in a separate trace payload", () => {
  const { invocation, child } = fixture();
  const duplicate = { ...invocation, trace_id: "other-trace", span_id: "other-lambda" };
  const result = check(rawLog([[invocation, child], [duplicate]]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exactly one Lambda span/);
});

test("rejects metrics-only logs without an invocation span", () => {
  const result = check(rawLog([]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exactly one Lambda span/);
});

test("rejects a missing unfinished child", () => {
  const { invocation } = fixture();
  const result = check(rawLog([[invocation]]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /killAll must flush every unfinished child/);
});

test("rejects a child exported in the wrong trace", () => {
  const { invocation, child } = fixture();
  child.trace_id = "unrelated-trace";
  const result = check(rawLog([[invocation, child]]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unfinished child must stay/);
});

test("rejects timeout decoration on the child instead of the invocation", () => {
  const { invocation, child } = fixture();
  invocation.error = 0;
  child.error = 1;
  const result = check(rawLog([[invocation, child]]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invocation must be marked as an error/);
});

test("rejects an invocation exported after the runtime reports its timeout", () => {
  const { invocation, child } = fixture();
  const result = check(rawLog([[invocation, child]], { late: true }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /span exported before runtime timeout REPORT/);
});

test("rejects falling back to the default flush deadline", () => {
  const { invocation, child } = fixture();
  invocation.duration = 4.9e9;
  const result = check(rawLog([[invocation, child]]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /span must honor the 3500ms flush deadline/);
});

test("requires evidence that RIE actually terminated the runtime", () => {
  const { invocation, child } = fixture();
  const result = check(rawLog([[invocation, child]], { kill: false }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /runtime kills/);
});
