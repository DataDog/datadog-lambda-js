import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Load handler.js with environment that forces the ESM branch on first
// require. The ESM branch only defines an async handler — it does not call
// loadSync or initTracer — so the module loads safely in a test process
// without a real user app.
//
// shouldUseEsmHandler reads process.env / fs at call time, not module-load
// time, so each test case can mutate the environment freely after the
// initial require.
const ORIGINAL_ENV = { ...process.env };
process.env.DD_LAMBDA_HANDLER = "_handler_spec_init.mjs.handler";
delete process.env._HANDLER;
process.env.LAMBDA_TASK_ROOT = os.tmpdir();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const handlerModule: { _shouldUseEsmHandler: () => boolean } = require("./handler");
const { _shouldUseEsmHandler: shouldUseEsmHandler } = handlerModule;

describe("handler.js shouldUseEsmHandler", () => {
  let tmpDirs: string[];

  beforeEach(() => {
    tmpDirs = [];
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  function makeTaskRoot(packageJson?: object): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "handler-spec-"));
    tmpDirs.push(dir);
    if (packageJson !== undefined) {
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(packageJson));
    }
    return dir;
  }

  it("returns true when _HANDLER points at a .mjs file", () => {
    process.env._HANDLER = "app.mjs.handler";
    delete process.env.DD_LAMBDA_HANDLER;
    process.env.LAMBDA_TASK_ROOT = makeTaskRoot();
    expect(shouldUseEsmHandler()).toBe(true);
  });

  it("returns true when DD_LAMBDA_HANDLER points at a .mjs file", () => {
    process.env.DD_LAMBDA_HANDLER = "app.mjs.handler";
    delete process.env._HANDLER;
    process.env.LAMBDA_TASK_ROOT = makeTaskRoot();
    expect(shouldUseEsmHandler()).toBe(true);
  });

  it('returns true when LAMBDA_TASK_ROOT/package.json has type: "module"', () => {
    process.env.DD_LAMBDA_HANDLER = "app.handler";
    delete process.env._HANDLER;
    process.env.LAMBDA_TASK_ROOT = makeTaskRoot({ type: "module" });
    expect(shouldUseEsmHandler()).toBe(true);
  });

  it("returns false when package.json exists without type: module", () => {
    process.env.DD_LAMBDA_HANDLER = "app.handler";
    delete process.env._HANDLER;
    process.env.LAMBDA_TASK_ROOT = makeTaskRoot({ name: "app" });
    expect(shouldUseEsmHandler()).toBe(false);
  });

  it("returns false when package.json is missing from LAMBDA_TASK_ROOT", () => {
    process.env.DD_LAMBDA_HANDLER = "app.handler";
    delete process.env._HANDLER;
    process.env.LAMBDA_TASK_ROOT = makeTaskRoot();
    expect(shouldUseEsmHandler()).toBe(false);
  });

  it("returns false when package.json is unparseable", () => {
    process.env.DD_LAMBDA_HANDLER = "app.handler";
    delete process.env._HANDLER;
    const dir = makeTaskRoot();
    fs.writeFileSync(path.join(dir, "package.json"), "{ not valid json");
    process.env.LAMBDA_TASK_ROOT = dir;
    expect(shouldUseEsmHandler()).toBe(false);
  });
});
