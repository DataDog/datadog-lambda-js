describe("isTracerInitialised", () => {
  let isTracerInitialised: () => boolean;
  let tracer: any;
  beforeEach(() => {
    isTracerInitialised = require("./dd-trace-utils").isTracerInitialised;
    tracer = require("dd-trace");
    process.env["AWS_LAMBDA_FUNCTION_NAME"] = "my-lambda";
  });
  afterEach(() => {
    jest.resetModules();
    delete process.env["AWS_LAMBDA_FUNCTION_NAME"];
  });
  it("should return true when tracer has been initialised", () => {
    tracer.init();
    expect(isTracerInitialised()).toBeTruthy();
  });
  it("should return false when tracer hasn't been initialised", () => {
    expect(isTracerInitialised()).toBeFalsy();
  });
});
