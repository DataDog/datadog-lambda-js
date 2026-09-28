"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");

function fixture(mode = "enabled") {
  const filenames = [
    "/var/task/cold-start-parent.js",
    "/var/task/cold-start-probe.js",
    "/var/task/cold-start-skip.js",
    "/var/task/cold-start-skipped-child.js",
    "/opt/cold-start-probe.js",
    "/var/runtime/cold-start-probe.js",
    "/var/task/cold-start-warm.js",
  ];
  const invocations = [1, 2, 3].map((i) => ({
    name: "aws.lambda",
    trace_id: `trace-${i}`,
    span_id: `lambda-${i}`,
    parent_id: i === 1 ? "inferred" : "0",
    start: i * 1e9,
    duration: 3e8,
    error: 0,
    meta: { request_id: `request-${i}` },
  }));
  const inferred = { name: "aws.apigateway", trace_id: "trace-1", span_id: "inferred", parent_id: "0" };
  const load = {
    name: "aws.lambda.load",
    trace_id: "trace-1",
    span_id: "load",
    parent_id: "inferred",
    start: 1e8,
    duration: 8e8,
  };
  const modules = filenames.map((filename, i) => ({
    name: filename.startsWith("/opt/")
      ? "aws.lambda.require_layer"
      : filename.startsWith("/var/runtime/")
      ? "aws.lambda.require_runtime"
      : "aws.lambda.require",
    trace_id: i === 6 ? "trace-2" : "trace-1",
    span_id: `module-${i}`,
    parent_id: i === 6 ? "lambda-2" : "load",
    start: i === 6 ? 2.1e9 : 2e8,
    duration: 5e7,
    meta: { filename },
  }));
  const calls = [1, 2, 3].map((i) => ({
    requestId: `request-${i}`,
    invocation: i,
    initializationType:
      mode === "managed"
        ? "lambda-managed-instances"
        : mode === "provisioned"
        ? "provisioned-concurrency"
        : "on-demand",
  }));
  const spans = [...invocations, inferred];
  if (!["disabled", "provisioned", "managed"].includes(mode)) {
    spans.push(load);
    if (mode !== "threshold") {
      spans.push(
        ...modules.filter((s) => mode !== "skip" || !/cold-start-skip(?:ped-child)?\.js$/.test(s.meta.filename)),
      );
    }
  }
  return { filenames, invocations, calls, spans, modules, load };
}

function check(data, mode = "enabled") {
  const input = [
    ...data.filenames.map((coldStartFixture) => JSON.stringify({ coldStartFixture })),
    ...data.calls.flatMap((c) => [
      `START RequestId: ${c.requestId} Version: $LATEST`,
      JSON.stringify({ coldStartInvocation: c }),
      `REPORT RequestId: ${c.requestId}`,
    ]),
    // Each span in a separate export: identities must work across all chunks.
    ...data.spans.map((s) => JSON.stringify({ traces: [[s]] })),
  ].join("\n");
  return spawnSync(process.execPath, [path.join(__dirname, "check-cold-start-logs.js"), mode, "3"], {
    input,
    encoding: "utf8",
  });
}

for (const mode of ["enabled", "skip", "threshold", "disabled", "provisioned", "managed"]) {
  test(`accepts ${mode} with cold and warm evidence`, () => {
    const result = check(fixture(mode), mode);
    assert.equal(result.status, 0, result.stderr);
  });
}

test("accepts invocation parenting when no inferred span exists", () => {
  const data = fixture();
  data.spans = data.spans.filter((s) => s.name !== "aws.apigateway");
  data.invocations[0].parent_id = "remote-parent";
  data.load.parent_id = data.invocations[0].span_id;
  const result = check(data);
  assert.equal(result.status, 0, result.stderr);
});

test("accepts core-module classification", () => {
  const data = fixture();
  data.spans.push({
    ...data.modules[0],
    name: "aws.lambda.require_core_module",
    span_id: "core",
    meta: { filename: "fs" },
  });
  const result = check(data);
  assert.equal(result.status, 0, result.stderr);
});

const regressions = [
  [
    "missing capture",
    (d) => {
      d.spans = d.spans.filter((s) => !s.name.startsWith("aws.lambda.require"));
    },
    /module-load capture/,
  ],
  [
    "missing load span",
    (d) => {
      d.spans = d.spans.filter((s) => s !== d.load);
    },
    /exactly one load/,
  ],
  [
    "duplicate root in another trace",
    (d) => {
      d.spans.push({ ...d.invocations[0], trace_id: "other", span_id: "duplicate" });
    },
    /exactly one Lambda/,
  ],
  [
    "cold load on warm invocation",
    (d) => {
      d.spans.push({ ...d.load, span_id: "warm-load", trace_id: "trace-2" });
    },
    /none on warm/,
  ],
  [
    "wrong load parent",
    (d) => {
      d.load.parent_id = "lambda-1";
    },
    /load parent/,
  ],
  [
    "cross-trace load",
    (d) => {
      d.load.trace_id = "other";
    },
    /first invocation trace/,
  ],
  [
    "load ends too late",
    (d) => {
      d.load.duration = 2e9;
    },
    /load ends/,
  ],
  [
    "init module ends too late",
    (d) => {
      d.modules[0].start = 1.1e9;
    },
    /init module finishes/,
  ],
  [
    "incorrect classification",
    (d) => {
      d.modules[4].name = "aws.lambda.require";
    },
    /classification/,
  ],
  [
    "missing known module",
    (d) => {
      d.spans = d.spans.filter((s) => s !== d.modules[4]);
    },
    /fixture span cardinality/,
  ],
  [
    "orphaned require",
    (d) => {
      d.modules[0].parent_id = "missing";
    },
    /require linked/,
  ],
  [
    "cyclic load tree",
    (d) => {
      d.modules[0].parent_id = d.modules[0].span_id;
    },
    /acyclic/,
  ],
  [
    "duplicate export",
    (d) => {
      d.spans.push({ ...d.modules[0] });
    },
    /duplicated exported/,
  ],
  [
    "warm module attached to first invocation",
    (d) => {
      d.modules[6].trace_id = "trace-1";
      d.modules[6].parent_id = "load";
    },
    /cold\/warm fixture parent/,
  ],
  [
    "stale module replay on third invocation",
    (d) => {
      d.spans.push({ ...d.modules[0], trace_id: "trace-3", span_id: "stale", parent_id: "lambda-3" });
    },
    /fixture span cardinality/,
  ],
  [
    "fresh environment per invocation",
    (d) => {
      d.calls[1].invocation = 1;
    },
    /warm environment reused/,
  ],
  [
    "fixture never executed",
    (d) => {
      d.filenames.pop();
    },
    /really loaded/,
  ],
];
for (const [name, mutate, message] of regressions) {
  test(`rejects ${name}`, () => {
    const data = fixture();
    mutate(data);
    const result = check(data);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
  });
}

for (const mode of ["disabled", "provisioned", "managed", "threshold"]) {
  test(`rejects require spans in ${mode} mode`, () => {
    const data = fixture(mode);
    data.spans.push(data.modules[0]);
    const result = check(data, mode);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /suppressed|high min-duration/);
  });
}

for (const index of [2, 3]) {
  test(`rejects an ignored ${index === 2 ? "library" : "subtree"} span`, () => {
    const data = fixture("skip");
    data.spans.push(data.modules[index]);
    const result = check(data, "skip");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /fixture span cardinality/);
  });
}

test("rejects a requested mode that the runtime did not apply", () => {
  const data = fixture("managed");
  data.calls[0].initializationType = "on-demand";
  const result = check(data, "managed");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requested initialization mode/);
});
