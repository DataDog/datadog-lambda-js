import { TracerWrapper } from "./tracer-wrapper";

let mockNoTracer = false;
let mockTracerInitialised = false;
const mockSpanContext = {
  toTraceId: () => "1234",
  toSpanId: () => "45678",
};
jest.mock("dd-trace", () => {
  if (mockNoTracer) {
    throw Error("Module missing");
  } else {
    return {
      _tracer: mockTracerInitialised ? { _service: {} } : {},
      extract: () => mockSpanContext,
      wrap: (name: any, options: any, fn: any) => fn,
    };
  }
});

describe("TracerWrapper", () => {
  beforeEach(() => {
    process.env["AWS_LAMBDA_FUNCTION_NAME"] = "my-lambda";
    mockNoTracer = false;
    mockTracerInitialised = true;
  });
  afterEach(() => {
    jest.resetModules();
    delete process.env["AWS_LAMBDA_FUNCTION_NAME"];
  });
  it("isTracerAvailable should return true when dd-trace is present and initialised", () => {
    mockNoTracer = false;
    const wrapper = new TracerWrapper();
    expect(wrapper.isTracerAvailable).toBeTruthy();
  });
  it("isTracerAvailable should return false when dd-trace is present and uninitialised", () => {
    mockNoTracer = false;
    mockTracerInitialised = false;
    const wrapper = new TracerWrapper();
    expect(wrapper.isTracerAvailable).toBeFalsy();
  });
  it("isTracerAvailable should return false when dd-trace is absent", () => {
    mockNoTracer = true;
    const wrapper = new TracerWrapper();
    expect(wrapper.isTracerAvailable).toBeFalsy();
  });
  it("should extract span context when dd-trace is present", () => {
    const wrapper = new TracerWrapper();
    expect(wrapper.extract({})).toBe(mockSpanContext);
  });
  it("shouldn't extract span context when dd-trace is absent", () => {
    mockNoTracer = true;
    const wrapper = new TracerWrapper();
    expect(wrapper.extract({})).toBeNull();
  });
});
