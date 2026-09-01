import { spawnSync, SpawnSyncReturns } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoPath = join(__dirname, "..");
const normalizerPath = join(repoPath, "scripts", "normalize_integration_logs.sh");
const readinessPath = join(repoPath, "scripts", "wait_for_complete_logs.sh");
const runnerPath = join(repoPath, "scripts", "run_integration_tests.sh");
const waitInvocation = 'source "$1"; shift; wait_for_complete_logs "$@"';

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
  '2026-09-02T01:30:00.000Z\trequest-id\tERROR\t(node:123) TimeoutOverflowWarning: 2147483648',
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

/**
 * @param expectedCompletionCount required Serverless completion records
 * @param maxAttempts maximum command attempts
 * @param retryIntervalSeconds delay between attempts
 * @param command command and arguments that fetch logs
 */
function waitForCompleteLogs(
  expectedCompletionCount: number,
  maxAttempts: number,
  retryIntervalSeconds: number,
  command: string[],
): SpawnSyncReturns<string> {
  return spawnSync(
    "bash",
    [
      "-c",
      waitInvocation,
      "wait-for-complete-logs",
      readinessPath,
      String(expectedCompletionCount),
      String(maxAttempts),
      String(retryIntervalSeconds),
      ...command,
    ],
    { encoding: "utf8" },
  );
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

describe("integration log readiness", () => {
  it("keeps successful command diagnostics out of returned logs", () => {
    const producer = ["bash", "-c", "printf 'serverless warning\\n' >&2; printf 'END Duration: 1 ms\\n'"];
    const result = waitForCompleteLogs(1, 1, 0, producer);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("END Duration: 1 ms\n");
    expect(result.stderr).toContain("serverless warning");
  });

  it("retries command failures and incomplete results", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "lambda-log-wait-"));
    const attemptPath = join(temporaryDirectory, "attempt");
    const producerScript = [
      "attempt=0",
      'if [ -f "$1" ]; then',
      '    read -r attempt < "$1"',
      "fi",
      "attempt=$((attempt + 1))",
      'printf \'%s\\n\' "$attempt" > "$1"',
      'if [ "$attempt" -eq 1 ]; then',
      "    printf 'temporary failure\\n' >&2",
      "    exit 7",
      "fi",
      "printf 'END Duration: 1 ms\\n'",
      'if [ "$attempt" -ge 3 ]; then',
      "    printf 'END Duration: 1 ms\\n'",
      "fi",
    ].join("\n");
    const producer = ["bash", "-c", producerScript, "log-producer", attemptPath];

    try {
      const result = waitForCompleteLogs(2, 3, 0, producer);

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("END Duration: 1 ms\nEND Duration: 1 ms\n");
      expect(result.stderr).toContain("attempt 1/3 failed with exit code 7");
      expect(result.stderr).toContain("attempt 2/3 found 1 of 2 completion records");
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("fails after the final command error", () => {
    const result = waitForCompleteLogs(1, 2, 0, ["bash", "-c", "printf 'no logs\\n' >&2; exit 4"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("attempt 2/2 failed with exit code 4");
    expect(result.stderr).toContain("Logs remained incomplete after 2 attempts");
  });

  it("fails after the final incomplete result", () => {
    const result = waitForCompleteLogs(2, 1, 0, ["printf", "END Duration: 1 ms\n"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("found 1 of 2 completion records");
  });

  it("rejects a zero expected completion count", () => {
    const result = waitForCompleteLogs(0, 1, 0, ["true"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Expected completion count must be a positive integer");
  });

  it("rejects a zero maximum attempt count", () => {
    const result = waitForCompleteLogs(1, 0, 0, ["true"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Maximum attempts must be a positive integer");
  });

  it("rejects a negative retry interval", () => {
    const result = waitForCompleteLogs(1, 1, -1, ["true"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Retry interval must be a non-negative integer");
  });

  it("requires a log command", () => {
    const result = waitForCompleteLogs(1, 1, 0, []);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("requires an expected count, attempts, interval, and command");
  });
});

describe("integration test runner", () => {
  it("keeps script paths valid after changing directories", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "lambda-integration-runner-"));
    const temporaryRepo = join(temporaryDirectory, "repo");
    const temporaryScripts = join(temporaryRepo, "scripts");
    const temporaryIntegrationTests = join(temporaryRepo, "integration_tests");
    const temporaryBin = join(temporaryDirectory, "bin");
    const normalizerArgumentsPath = join(temporaryDirectory, "normalizer-arguments");
    const handlerNames = [
      "async-metrics",
      "esm",
      "sync-metrics",
      "http-requests",
      "process-input-traced",
      "throw-error-traced",
      "status-code-500s",
      "container-cjs",
      "container-esm",
    ];

    mkdirSync(temporaryScripts, { recursive: true });
    mkdirSync(join(temporaryIntegrationTests, "input_events"), { recursive: true });
    mkdirSync(join(temporaryIntegrationTests, "snapshots", "logs"), { recursive: true });
    mkdirSync(join(temporaryIntegrationTests, "snapshots", "return_values"), { recursive: true });
    mkdirSync(temporaryBin);
    cpSync(runnerPath, join(temporaryScripts, "run_integration_tests.sh"));
    cpSync(readinessPath, join(temporaryScripts, "wait_for_complete_logs.sh"));
    cpSync(
      join(repoPath, "integration_tests", "input_events", "api-gateway-get.json"),
      join(temporaryIntegrationTests, "input_events", "api-gateway-get.json"),
    );
    cpSync(join(repoPath, "integration_tests", "parse-json.js"), join(temporaryIntegrationTests, "parse-json.js"));
    mkdirSync(join(temporaryIntegrationTests, "container", "cjs"), { recursive: true });
    mkdirSync(join(temporaryIntegrationTests, "container", "esm"), { recursive: true });
    for (const handlerName of handlerNames) {
      cpSync(
        join(repoPath, "integration_tests", "snapshots", "logs", `${handlerName}_node18.log`),
        join(temporaryIntegrationTests, "snapshots", "logs", `${handlerName}_node18.log`),
      );
      cpSync(
        join(repoPath, "integration_tests", "snapshots", "return_values", `${handlerName}_node18_api-gateway-get.json`),
        join(temporaryIntegrationTests, "snapshots", "return_values", `${handlerName}_node18_api-gateway-get.json`),
      );
    }

    const commandStub = ["#!/bin/bash", "exit 0", ""].join("\n");
    const normalizerStub = ["#!/bin/bash", 'printf "%s\\n" "$*" >> "$NORMALIZER_ARGUMENTS"', "cat", ""].join("\n");
    const npmStub = ["#!/bin/bash", "touch datadog-lambda-js-test.tgz", ""].join("\n");
    const xxdStub = ["#!/bin/bash", 'printf "01234567\\n"', ""].join("\n");
    const serverlessStub = [
      "#!/bin/bash",
      'command="$1"',
      "shift",
      'if [ "$command" = "deploy" ] || [ "$command" = "remove" ]; then',
      "    exit 0",
      "fi",
      'while [ "$#" -gt 0 ]; do',
      '    case "$1" in',
      "        -f)",
      '            function_name="$2"',
      "            shift 2",
      "            ;;",
      "        --path)",
      '            input_path="$2"',
      "            shift 2",
      "            ;;",
      "        *)",
      "            shift",
      "            ;;",
      "    esac",
      "done",
      'handler_name="${function_name%_node}"',
      'if [ "$command" = "invoke" ]; then',
      '    input_name="$(basename "${input_path%.json}")"',
      '    cat "./snapshots/return_values/${handler_name}_${RUNTIME}_${input_name}.json"',
      "else",
      '    cat "./snapshots/logs/${handler_name}_${RUNTIME}.log"',
      "fi",
      "",
    ].join("\n");

    writeFileSync(join(temporaryScripts, "normalize_integration_logs.sh"), normalizerStub);
    writeFileSync(join(temporaryBin, "yarn"), commandStub);
    writeFileSync(join(temporaryBin, "npm"), npmStub);
    writeFileSync(join(temporaryBin, "serverless"), serverlessStub);
    writeFileSync(join(temporaryBin, "xxd"), xxdStub);
    chmodSync(join(temporaryBin, "yarn"), 0o755);
    chmodSync(join(temporaryBin, "npm"), 0o755);
    chmodSync(join(temporaryBin, "serverless"), 0o755);
    chmodSync(join(temporaryBin, "xxd"), 0o755);
    chmodSync(join(temporaryScripts, "normalize_integration_logs.sh"), 0o755);

    try {
      const result = spawnSync("./scripts/run_integration_tests.sh", [], {
        cwd: temporaryRepo,
        encoding: "utf8",
        env: {
          ...process.env,
          AWS_SECRET_ACCESS_KEY: "test",
          DD_API_KEY: "test",
          NORMALIZER_ARGUMENTS: normalizerArgumentsPath,
          PATH: `${temporaryBin}:${process.env.PATH}`,
          RUNTIME_PARAM: "18",
        },
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("SUCCESS: No difference found between snapshots and new return values or logs");
      expect(readFileSync(normalizerArgumentsPath, "utf8")).toContain("aws formatted\n");
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
