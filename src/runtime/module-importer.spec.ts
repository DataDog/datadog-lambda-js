import * as path from "node:path";
import { pathToFileURL } from "node:url";

const ddTracePath = require.resolve("dd-trace");
const ddTraceRegisterPath = path.join(path.dirname(ddTracePath), "register.js");

type Tracer = {
  use: jest.Mock<void, [string, { blocklist: RegExp }]>;
};

describe("module importer", () => {
  let init: jest.Mock<Tracer, [{ tags: string }]>;
  let logDebug: jest.Mock<void, [string, { error: Error }?]>;
  let moduleRegister: jest.Mock<void, [URL]>;
  let moduleRegisterHooks: jest.Mock<boolean, []>;
  let registerLoader: jest.Mock<void, []>;
  let tracer: Tracer;
  let updateDDTags: jest.Mock<string, [Record<string, string>]>;
  const originalExecArgv = [...process.execArgv];
  const originalNodeOptions = process.env.NODE_OPTIONS;

  /**
   * Requires the module under test and installs the default spies that keep
   * the tests on the asynchronous loader fallback path.
   */
  function requireModuleImporter() {
    // tslint:disable-next-line:no-var-requires
    const moduleImporter = require("./module_importer");
    jest.spyOn(moduleImporter, "isSyncLoaderHookVersionSupported").mockReturnValue(false);
    jest
      .spyOn(moduleImporter, "import")
      .mockRejectedValue(new Error("loader-hook.mjs import should not have been called"));
    return moduleImporter;
  }

  beforeEach(() => {
    jest.resetModules();
    process.execArgv.splice(0, process.execArgv.length);
    delete process.env.NODE_OPTIONS;

    logDebug = jest.fn();
    moduleRegister = jest.fn();
    moduleRegisterHooks = jest.fn().mockReturnValue(true);
    registerLoader = jest.fn();
    tracer = { use: jest.fn() };
    init = jest.fn().mockReturnValue(tracer);
    updateDDTags = jest.fn().mockReturnValue("_dd.origin:lambda");

    jest.doMock("../utils", () => ({ logDebug, updateDDTags }));
    jest.doMock(ddTracePath, () => ({ init }));
    jest.doMock(ddTraceRegisterPath, () => {
      registerLoader();
      return {};
    });
    jest.doMock("node:module", () => ({
      ...jest.requireActual<typeof import("node:module")>("node:module"),
      register: moduleRegister,
      registerHooks: moduleRegisterHooks,
    }));
  });

  afterEach(() => {
    process.execArgv.splice(0, process.execArgv.length, ...originalExecArgv);
    if (originalNodeOptions === undefined) {
      delete process.env.NODE_OPTIONS;
    } else {
      process.env.NODE_OPTIONS = originalNodeOptions;
    }
  });

  it("initializes the tracer and loads its ESM registration entry point", async () => {
    const { initTracer } = requireModuleImporter();

    await expect(initTracer()).resolves.toBe(tracer);
    expect(updateDDTags).toHaveBeenCalledWith({ "_dd.origin": "lambda" });
    expect(init).toHaveBeenCalledWith({ tags: "_dd.origin:lambda" });
    expect(tracer.use).toHaveBeenCalledWith("http", { blocklist: expect.any(RegExp) });
    expect(registerLoader).toHaveBeenCalledTimes(1);
  });

  it("does not register again when NODE_OPTIONS preloads dd-trace", async () => {
    process.env.NODE_OPTIONS = "--import dd-trace/initialize.mjs";
    const moduleImporter = requireModuleImporter();
    jest.spyOn(moduleImporter, "isSyncLoaderHookVersionSupported").mockReturnValue(true);

    await expect(moduleImporter.initTracer()).resolves.toBe(tracer);
    expect(registerLoader).not.toHaveBeenCalled();
    expect(moduleImporter.import).not.toHaveBeenCalled();
  });

  it("does not register again when execArgv preloads dd-trace", async () => {
    process.execArgv.push("--require", "dd-trace/register.js");
    const moduleImporter = requireModuleImporter();
    jest.spyOn(moduleImporter, "isSyncLoaderHookVersionSupported").mockReturnValue(true);

    await expect(moduleImporter.initTracer()).resolves.toBe(tracer);
    expect(registerLoader).not.toHaveBeenCalled();
    expect(moduleImporter.import).not.toHaveBeenCalled();
  });

  it("registers when the Node arguments do not preload dd-trace", async () => {
    process.env.NODE_OPTIONS = "--enable-source-maps";
    process.execArgv.push("--trace-warnings");
    const { initTracer } = requireModuleImporter();

    await expect(initTracer()).resolves.toBe(tracer);
    expect(registerLoader).toHaveBeenCalledTimes(1);
  });

  it("falls back to the legacy loader when dd-trace has no registration entry point", async () => {
    const { initTracer } = requireModuleImporter();
    const error = Object.assign(new Error(`Cannot find module '${ddTraceRegisterPath}'`), { code: "MODULE_NOT_FOUND" });
    jest.doMock(ddTraceRegisterPath, () => {
      throw error;
    });

    await expect(initTracer()).resolves.toBe(tracer);
    expect(moduleRegister).toHaveBeenCalledWith(
      pathToFileURL(path.join(path.dirname(ddTracePath), "loader-hook.mjs")),
    );
    expect(logDebug).toHaveBeenCalledWith("registered dd-trace ESM loader hooks for ESM instrumentation");
  });

  it("does not load the registration entry point without module.register", async () => {
    jest.doMock("node:module", () => ({
      ...jest.requireActual<typeof import("node:module")>("node:module"),
      register: undefined,
      registerHooks: moduleRegisterHooks,
    }));
    const { initTracer } = requireModuleImporter();

    await expect(initTracer()).resolves.toBe(tracer);
    expect(registerLoader).not.toHaveBeenCalled();
  });

  it("keeps the initialized tracer when loader registration fails", async () => {
    const { initTracer } = requireModuleImporter();
    const error = new Error("registration failed");
    jest.doMock(ddTraceRegisterPath, () => {
      throw error;
    });

    await expect(initTracer()).resolves.toBe(tracer);
    expect(moduleRegister).not.toHaveBeenCalled();
    expect(logDebug).toHaveBeenCalledWith("failed to register dd-trace ESM loader hooks", { error });
  });

  it("registers the synchronous loader hooks when they are supported", async () => {
    const registerSyncLoaderHooks = jest.fn().mockReturnValue(true);
    const moduleImporter = requireModuleImporter();
    jest.spyOn(moduleImporter, "isSyncLoaderHookVersionSupported").mockReturnValue(true);
    jest.spyOn(moduleImporter, "import").mockResolvedValue({ registerSyncLoaderHooks });
    const { initTracer } = moduleImporter;

    await expect(initTracer()).resolves.toBe(tracer);
    expect(moduleImporter.import).toHaveBeenCalledWith(
      pathToFileURL(path.join(path.dirname(ddTracePath), "loader-hook.mjs")).href,
    );
    expect(registerSyncLoaderHooks).toHaveBeenCalledTimes(1);
    expect(moduleRegisterHooks).not.toHaveBeenCalled();
    expect(registerLoader).not.toHaveBeenCalled();
    expect(moduleRegister).not.toHaveBeenCalled();
    expect(logDebug).toHaveBeenCalledWith("registered dd-trace synchronous ESM loader hooks");
  });

  it("falls back to the asynchronous loader when the synchronous registration reports failure", async () => {
    const moduleImporter = requireModuleImporter();
    jest.spyOn(moduleImporter, "isSyncLoaderHookVersionSupported").mockReturnValue(true);
    jest.spyOn(moduleImporter, "import").mockResolvedValue({ registerSyncLoaderHooks: jest.fn().mockReturnValue(false) });
    const { initTracer } = moduleImporter;

    await expect(initTracer()).resolves.toBe(tracer);
    expect(registerLoader).toHaveBeenCalledTimes(1);
    expect(moduleRegister).not.toHaveBeenCalled();
  });

  it("falls back to the asynchronous loader when loader-hook.mjs has no sync registration export", async () => {
    const moduleImporter = requireModuleImporter();
    jest.spyOn(moduleImporter, "isSyncLoaderHookVersionSupported").mockReturnValue(true);
    jest.spyOn(moduleImporter, "import").mockResolvedValue({});
    const { initTracer } = moduleImporter;

    await expect(initTracer()).resolves.toBe(tracer);
    expect(registerLoader).toHaveBeenCalledTimes(1);
  });

  it("logs and falls back to the asynchronous loader when the loader-hook import fails", async () => {
    const moduleImporter = requireModuleImporter();
    jest.spyOn(moduleImporter, "isSyncLoaderHookVersionSupported").mockReturnValue(true);
    const error = new Error("import failed");
    jest.spyOn(moduleImporter, "import").mockRejectedValue(error);
    const { initTracer } = moduleImporter;

    await expect(initTracer()).resolves.toBe(tracer);
    expect(logDebug).toHaveBeenCalledWith("failed to register dd-trace synchronous ESM loader hooks, falling back", {
      error,
    });
    expect(registerLoader).toHaveBeenCalledTimes(1);
  });

  it("does not fall back when the synchronous registration throws after loading", async () => {
    const moduleImporter = requireModuleImporter();
    jest.spyOn(moduleImporter, "isSyncLoaderHookVersionSupported").mockReturnValue(true);
    const error = new Error("registration threw");
    jest
      .spyOn(moduleImporter, "import")
      .mockResolvedValue({ registerSyncLoaderHooks: jest.fn().mockImplementation(() => { throw error; }) });
    const { initTracer } = moduleImporter;

    await expect(initTracer()).resolves.toBe(tracer);
    expect(logDebug).toHaveBeenCalledWith(
      "dd-trace synchronous ESM loader hook registration threw; skipping the asynchronous loader to avoid registering hooks twice",
      { error },
    );
    expect(registerLoader).not.toHaveBeenCalled();
    expect(moduleRegister).not.toHaveBeenCalled();
  });

  it("does not import loader-hook.mjs when the Node version is unsupported", async () => {
    const moduleImporter = requireModuleImporter();
    const { initTracer } = moduleImporter;

    await expect(initTracer()).resolves.toBe(tracer);
    expect(moduleImporter.import).not.toHaveBeenCalled();
    expect(registerLoader).toHaveBeenCalledTimes(1);
  });

  it("does not import loader-hook.mjs without module.registerHooks", async () => {
    jest.doMock("node:module", () => ({
      ...jest.requireActual<typeof import("node:module")>("node:module"),
      register: moduleRegister,
      registerHooks: undefined,
    }));
    const moduleImporter = requireModuleImporter();
    jest.spyOn(moduleImporter, "isSyncLoaderHookVersionSupported").mockReturnValue(true);
    const { initTracer } = moduleImporter;

    await expect(initTracer()).resolves.toBe(tracer);
    expect(moduleImporter.import).not.toHaveBeenCalled();
    expect(registerLoader).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["18.20.0", false],
    ["20.19.0", false],
    ["22.11.0", false],
    ["22.22.2", false],
    ["23.11.0", false],
    ["24.11.0", false],
    ["25.0.0", false],
    ["22.22.3", true],
    ["22.23.0", true],
    ["24.11.1", true],
    ["24.12.0", true],
    ["25.1.0", true],
    ["26.0.0", true],
    ["27.0.0", true],
  ])("reports synchronous loader hook support for Node %s as %s", (nodeVersion, expected) => {
    const { isSyncLoaderHookVersionSupported } = require("./module_importer");

    expect(isSyncLoaderHookVersionSupported(nodeVersion)).toBe(expected);
  });
});
