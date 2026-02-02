import { _resetColdStart, didFunctionColdStart, setSandboxInit, isProactiveInitialization, isManagedInstancesMode } from "./cold-start";

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

  it("identifies managed instances mode when AWS_LAMBDA_INITIALIZATION_TYPE is set", () => {
    const originalValue = process.env.AWS_LAMBDA_INITIALIZATION_TYPE;

    process.env.AWS_LAMBDA_INITIALIZATION_TYPE = "lambda-managed-instances";
    expect(isManagedInstancesMode()).toEqual(true);

    process.env.AWS_LAMBDA_INITIALIZATION_TYPE = originalValue;
  });

  it("identifies non-managed instances mode when AWS_LAMBDA_INITIALIZATION_TYPE is not set", () => {
    const originalValue = process.env.AWS_LAMBDA_INITIALIZATION_TYPE;

    delete process.env.AWS_LAMBDA_INITIALIZATION_TYPE;
    expect(isManagedInstancesMode()).toEqual(false);

    process.env.AWS_LAMBDA_INITIALIZATION_TYPE = originalValue;
  });

  it("identifies non-managed instances mode when AWS_LAMBDA_INITIALIZATION_TYPE has different value", () => {
    const originalValue = process.env.AWS_LAMBDA_INITIALIZATION_TYPE;

    process.env.AWS_LAMBDA_INITIALIZATION_TYPE = "on-demand";
    expect(isManagedInstancesMode()).toEqual(false);

    process.env.AWS_LAMBDA_INITIALIZATION_TYPE = originalValue;
  });
});
