import { _resetColdStart, didFunctionColdStart, setSandboxInit, isProactiveInitialization } from "./cold-start";

beforeEach(_resetColdStart);
afterAll(_resetColdStart);

describe("cold-start", () => {
  it("identifies cold starts on the first execution", () => {
    setSandboxInit(0, 1);
    expect(didFunctionColdStart()).toEqual(true);
  });

  it("identifies non-cold starts on subsequent executions", () => {

    setSandboxInit(0, 1);
    expect(didFunctionColdStart()).toEqual(true);

    setSandboxInit(0, 1);
    expect(didFunctionColdStart()).toEqual(false);

    setSandboxInit(0, 1);
    expect(didFunctionColdStart()).toEqual(false);
  });

  it("identifies proactive invocations on the first execution", () => {

    setSandboxInit(0, 100000);
    expect(didFunctionColdStart()).toEqual(false);
    expect(isProactiveInitialization()).toEqual(true);

    setSandboxInit(0, 1);
    expect(didFunctionColdStart()).toEqual(false);

    setSandboxInit(0, 1);
    expect(didFunctionColdStart()).toEqual(false);
  });

  it("identifies non-proactive invocations on subsequent invocations", () => {

    setSandboxInit(0, 100000);
    expect(didFunctionColdStart()).toEqual(false);
    expect(isProactiveInitialization()).toEqual(true);

    setSandboxInit(0, 100000);
    expect(didFunctionColdStart()).toEqual(false);
    expect(isProactiveInitialization()).toEqual(false);

    setSandboxInit(0, 100000);
    expect(didFunctionColdStart()).toEqual(false);
    expect(isProactiveInitialization()).toEqual(false);
  });
});
