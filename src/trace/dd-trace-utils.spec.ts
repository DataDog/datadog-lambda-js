describe("isTracerInitialized", () => {
  let isTracerInitialized: () => boolean;
  let tracer: any;
  beforeEach(() => {
    isTracerInitialized = require("./dd-trace-utils").isTracerInitialized;
    tracer = require("dd-trace");
    process.env["AWS_LAMBDA_FUNCTION_NAME"] = "my-lambda";
  });
  afterEach(() => {
    jest.resetModules();
    delete process.env["AWS_LAMBDA_FUNCTION_NAME"];
  });
  it("should return true when tracer has been initialised", () => {
    tracer.init();
    expect(isTracerInitialized()).toBeTruthy();
  });
  it("should return false when tracer hasn't been initialised", () => {
    expect(isTracerInitialized()).toBeFalsy();
  });
});
