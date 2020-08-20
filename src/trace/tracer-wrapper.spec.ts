import { TracerWrapper } from "./tracer-wrapper";
import { Source, SampleMode } from "./constants";

let mockNoTracer = false;
let mockTracerInitialised = false;
let mockSpan: any = null;
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
      scope: () => ({
        active: () => mockSpan,
      }),
    };
  }
});

describe("TracerWrapper", () => {
  beforeEach(() => {
    process.env["AWS_LAMBDA_FUNCTION_NAME"] = "my-lambda";
    mockNoTracer = false;
    mockTracerInitialised = true;
    mockSpan = null;
  });
  afterEach(() => {
    jest.resetModules();
    delete process.env["AWS_LAMBDA_FUNCTION_NAME"];
  });
  it("isTracerAvailable should return true when dd-trace is present and initialised", () => {
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

  it("should find the current span context", () => {
    const spanID = "1234";
    const traceID = "45678";

    mockSpan = {
      context: () => ({
        toSpanId: () => spanID,
        toTraceId: () => traceID,
      }),
    };
    const wrapper = new TracerWrapper();
    const traceContext = wrapper.traceContext();
    expect(traceContext).toEqual({
      parentID: spanID,
      traceID: traceID,
      source: Source.Event,
      sampleMode: SampleMode.AUTO_KEEP,
    });
  });
  it("should return undefined when no span is available", () => {
    const wrapper = new TracerWrapper();
    const traceContext = wrapper.traceContext();
    expect(traceContext).toBeUndefined();
  });
});
