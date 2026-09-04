// Tests for the shared AWS/RIE integration-log normalizer. The readiness
// (wait_for_complete_logs) and runner tests that lived here moved with the
// retired AWS suite to the integration-tests-residual suite in
// serverless-e2e-tests.
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const repoPath = join(__dirname, "..");
const normalizerPath = join(repoPath, "scripts", "normalize_integration_logs.sh");

const standardLogs = [
  JSON.stringify({
    meta: {
      cold_start: "true",
      service: "checkout",
    },
    metrics: {
      stable: 1,
    },
    tags: ["cold_start:true"],
  }),
  "END Duration: 12.34 ms Memory Used: 128 MB",
].join("\n");

const proactiveLogs = [
  "INIT_START Runtime Version: nodejs:22.v1",
  JSON.stringify({
    meta: {
      cold_start: "false",
      proactive_initialization: 1,
      service: "checkout",
    },
    metrics: {
      proactive_initialization: 1,
      stable: 1,
    },
    tags: ["proactive_initialization:true", "cold_start:false"],
  }),
  "END Duration: 12.34 ms Memory Used: 128 MB (init: 42.1 ms)",
].join("\n");

const rieVolatileLogs = [
  'mock-http saw headers: {"x-datadog-trace-id":"123","x-datadog-parent-id":"456","traceparent":"00-abc-def-01","tracestate":"dd=s:1"}',
  "2026-09-02T01:30:00.000Z\trequest-id\tERROR\t(node:123) TimeoutOverflowWarning: 2147483648",
  JSON.stringify({ requestId: "12345678-1234-1234-1234-123456789abc", "dns.addresses": "172.18.0.4" }),
  "LocalProcessSupervisor.Exec pid=123",
  "(Use `node --trace-warnings ...` to show where the warning was created)",
].join("\n");

/**
 * @param input raw Lambda logs
 * @param platform integration-test platform
 * @param runId optional deployment run ID
 * @param inputFormat raw logs or formatted snapshot input
 */
function normalize(
  input: string,
  platform: "aws" | "rie",
  runId?: string,
  inputFormat: "raw" | "formatted" = "raw",
): string {
  const result = spawnSync(normalizerPath, [platform, inputFormat], {
    encoding: "utf8",
    env: {
      ...process.env,
      RUN_ID: runId ?? "",
    },
    input,
  });

  expect(result.status).toBe(0);
  return result.stdout;
}

describe("integration log normalization", () => {
  it("normalizes AWS scheduling differences", () => {
    const normalizedProactiveLogs = normalize(proactiveLogs, "aws");

    expect(normalizedProactiveLogs).not.toContain("INIT_START");
    expect(normalizedProactiveLogs).not.toContain("proactive_initialization");
    expect(normalizedProactiveLogs).not.toContain("cold_start:false");
    expect(normalizedProactiveLogs).toContain('"cold_start": "XXXX"');
    expect(normalizedProactiveLogs).toContain("cold_start:XXXX");
    expect(normalizedProactiveLogs).toBe(normalize(standardLogs, "aws"));
    expect(normalize(`\n${standardLogs}`, "aws")).toBe(normalize(standardLogs, "aws"));
  });

  it("preserves deterministic RIE cold-start output", () => {
    const normalizedProactiveLogs = normalize(proactiveLogs, "rie");

    expect(normalizedProactiveLogs).not.toContain("proactive_initialization");
    expect(normalizedProactiveLogs).toContain('"cold_start": "false"');
    expect(normalizedProactiveLogs).toContain("cold_start:false");
    expect(normalizedProactiveLogs).not.toBe(normalize(standardLogs, "rie"));
  });

  it("preserves stable telemetry differences", () => {
    const changedLogs = standardLogs.replace("checkout", "payments");

    expect(normalize(changedLogs, "aws")).not.toBe(normalize(standardLogs, "aws"));
  });

  it("does not reformat formatted snapshots", () => {
    const normalizedLogs = normalize(JSON.stringify({ tags: ["runtime:nodejs18.x"] }), "aws");

    expect(normalize(normalizedLogs, "aws", undefined, "formatted")).toBe(normalizedLogs);
  });

  it("normalizes RIE-specific volatile values", () => {
    const normalizedLogs = normalize(rieVolatileLogs, "rie");

    expect(normalizedLogs).toContain('"x-datadog-trace-id":"XXXX"');
    expect(normalizedLogs).toContain('"x-datadog-parent-id":"XXXX"');
    expect(normalizedLogs).toContain('"traceparent":"XXXX"');
    expect(normalizedLogs).toContain('"tracestate":"XXXX"');
    expect(normalizedLogs).toContain("XXXX-XX-XXTXX:XX:XX.XXXZ");
    expect(normalizedLogs).toContain("(node:XX) TimeoutOverflowWarning: XXXX");
    expect(normalizedLogs).toContain('"requestId": "XXXX"');
    expect(normalizedLogs).toContain('"dns.addresses": "XXXX"');
    expect(normalizedLogs).toContain("LocalProcessSupervisor.Exec pid=XX");
    expect(normalizedLogs).not.toContain("trace-warnings");
  });

  it("strips a literal run ID", () => {
    const runId = "id.with+characters";

    expect(normalize("function-" + runId, "aws", runId)).toContain("function-XXXX");
  });

  it("rejects an unsupported platform", () => {
    const result = spawnSync(normalizerPath, ["azure"], {
      encoding: "utf8",
      input: standardLogs,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unsupported integration-test platform: azure");
  });

  it("requires a platform", () => {
    const result = spawnSync(normalizerPath, [], {
      encoding: "utf8",
      input: standardLogs,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });

  it("rejects an unsupported log format", () => {
    const result = spawnSync(normalizerPath, ["aws", "compact"], {
      encoding: "utf8",
      input: standardLogs,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unsupported integration-test log format: compact");
  });
});
