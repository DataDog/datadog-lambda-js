import { spawnSync } from "node:child_process";
import * as Module from "node:module";
import * as path from "node:path";

const moduleWithHooks = Module as typeof Module & { register?: unknown; registerHooks?: unknown };
const hasLoaderAPI =
  typeof moduleWithHooks.register === "function" || typeof moduleWithHooks.registerHooks === "function";
const describeWithLoader = hasLoaderAPI ? describe : describe.skip;

describeWithLoader("module importer", () => {
  const flags = process.allowedNodeEnvironmentFlags.has("--no-experimental-require-module")
    ? ["--no-experimental-require-module"]
    : [];

  it.each([
    ["awaits hooks before loading the extractor and customer", {}],
    ["shares registration between concurrent startup calls", { concurrent: true }],
    ["does not fall back after an internal ESM registration failure", { broken: true }],
    ["does not register when tracing is disabled", { disabled: true }],
    ["uses register.js with older tracers", { legacy: true }],
    ["uses the legacy loader when both registration entry points are missing", { legacy: true, noRegister: true }],
    ["does not fall back after an internal CommonJS registration failure", { legacy: true, broken: true }],
    ["does not attempt registration without either loader API", { noLoader: true }],
    ["awaits initialize.mjs when NODE_OPTIONS was ignored by the runtime", { initialize: true }],
    ["registers when an unrelated preload mentions dd-trace", { unrelatedPreload: true }],
    ["reuses an already loaded register.js", { preloaded: true }],
  ])("%s", (_, options) => {
    runImporterFixture(options);
  });

  (typeof moduleWithHooks.registerHooks === "function" ? it : it.skip)("works without module.register", () => {
    runImporterFixture({ withoutAsyncLoader: true });
  });

  (typeof moduleWithHooks.registerHooks === "function" ? it : it.skip)(
    "still registers when a CommonJS preload installed no hooks",
    () => runImporterFixture({ withoutAsyncLoader: true, preloadedNoHooks: true }),
  );

  function runImporterFixture(options: object) {
    const result = spawnSync(
      process.execPath,
      [...flags, path.join(__dirname, "fixtures/module-importer-runner.cjs"), JSON.stringify(options)],
      { encoding: "utf8", timeout: 10_000, env: { ...process.env, NODE_OPTIONS: "" } },
    );
    expect(result.error).toBeUndefined();
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    if (!("noRegister" in options)) expect(result.stderr).toBe("");
  }
});
