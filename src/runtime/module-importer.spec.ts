import * as path from "node:path";

const ddTracePath = require.resolve("dd-trace");
const ddTraceRegisterPath = path.join(path.dirname(require.resolve("dd-trace/package.json")), "register.js");

type Tracer = {
  use: jest.Mock<void, [string, { blocklist: RegExp }]>;
};

describe("module importer", () => {
  let init: jest.Mock<Tracer, [{ tags: string }]>;
  let logDebug: jest.Mock<void, [string, { error: Error }?]>;
  let registerLoader: jest.Mock<void, []>;
  let tracer: Tracer;
  let updateDDTags: jest.Mock<string, [Record<string, string>]>;
  const originalExecArgv = [...process.execArgv];
  const originalNodeOptions = process.env.NODE_OPTIONS;

  beforeEach(() => {
    jest.resetModules();
    process.execArgv.splice(0, process.execArgv.length);
    delete process.env.NODE_OPTIONS;

    logDebug = jest.fn();
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
      register: jest.fn(),
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

  it("initializes the tracer and loads its ESM registration entry point", () => {
    const { initTracer } = require("./module_importer");

    expect(initTracer()).toBe(tracer);
    expect(updateDDTags).toHaveBeenCalledWith({ "_dd.origin": "lambda" });
    expect(init).toHaveBeenCalledWith({ tags: "_dd.origin:lambda" });
    expect(tracer.use).toHaveBeenCalledWith("http", { blocklist: expect.any(RegExp) });
    expect(registerLoader).toHaveBeenCalledTimes(1);
  });

  it("does not register again when NODE_OPTIONS preloads dd-trace", () => {
    process.env.NODE_OPTIONS = "--import dd-trace/initialize.mjs";
    const { initTracer } = require("./module_importer");

    expect(initTracer()).toBe(tracer);
    expect(registerLoader).not.toHaveBeenCalled();
  });

  it("does not register again when execArgv preloads dd-trace", () => {
    process.execArgv.push("--require", "dd-trace/register.js");
    const { initTracer } = require("./module_importer");

    expect(initTracer()).toBe(tracer);
    expect(registerLoader).not.toHaveBeenCalled();
  });

  it("does not load the registration entry point without module.register", () => {
    jest.doMock("node:module", () => ({
      ...jest.requireActual<typeof import("node:module")>("node:module"),
      register: undefined,
    }));
    const { initTracer } = require("./module_importer");

    expect(initTracer()).toBe(tracer);
    expect(registerLoader).not.toHaveBeenCalled();
  });

  it("keeps the initialized tracer when loader registration fails", () => {
    const error = new Error("registration failed");
    jest.doMock(ddTraceRegisterPath, () => {
      throw error;
    });
    const { initTracer } = require("./module_importer");

    expect(initTracer()).toBe(tracer);
    expect(logDebug).toHaveBeenCalledWith("failed to register dd-trace ESM loader hooks", { error });
  });
});
