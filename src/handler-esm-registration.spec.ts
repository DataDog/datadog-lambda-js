import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const fixtureDirectory = path.join(__dirname, "runtime", "fixtures", "esm-registration");
// Lambda disables require(esm).
const flags = process.allowedNodeEnvironmentFlags.has("--experimental-require-module")
  ? ["--no-experimental-require-module"]
  : [];

function runPublishedHandler(failRegistration: boolean) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DD_ENHANCED_METRICS: "false",
    DD_LAMBDA_HANDLER: "handler.handle",
    DD_TRACE_ENABLED: "true",
    DD_TRACE_EXTRACTOR: "extractor.extract",
    FAIL_REGISTRATION: String(failRegistration),
    FAKE_TRACER_PATH: path.join(fixtureDirectory, "tracer", "index.js"),
    HANDLER_TEST_ENTRY: pathToFileURL(path.join(__dirname, "..", "dist", "handler.mjs")).href,
    LAMBDA_TASK_ROOT: fixtureDirectory,
  };
  delete env.NODE_OPTIONS;

  const child = spawnSync(process.execPath, [...flags, path.join(fixtureDirectory, "runner.mjs")], {
    encoding: "utf8",
    env,
    timeout: 15_000,
  });
  if (child.status !== 0) {
    throw new Error(`Published handler failed: code=${child.status}\n${child.stdout}\n${child.stderr}`);
  }

  const lines = child.stdout.trim().split("\n");
  return JSON.parse(lines[lines.length - 1]);
}

describe("published handler with dd-trace/register.mjs", () => {
  it("imports register.mjs before loading the extractor and handler", () => {
    expect(runPublishedHandler(false)).toEqual({
      events: ["register.mjs", "extractor", "handler"],
      result: { statusCode: 200 },
    });
  });

  it("still loads the handler when register.mjs fails", () => {
    expect(runPublishedHandler(true)).toEqual({
      events: ["extractor", "handler"],
      result: { statusCode: 200 },
    });
  });
});
