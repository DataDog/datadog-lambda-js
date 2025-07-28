import { TracerWrapper } from "./tracer-wrapper";

let mockNoTracer = false;
let mockTracerInitialised = false;
let mockSpan: any = null;
let mockDataStreamsCheckpointer: any = {
  setConsumeCheckpoint: jest.fn(),
};
jest.mock("dd-trace/packages/dd-trace/src/datastreams/checkpointer", () => {
  return {
    DataStreamsCheckpointer: jest.fn().mockImplementation(() => mockDataStreamsCheckpointer),
  };
});

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
      dataStreamsCheckpointer: mockDataStreamsCheckpointer,
    };
  }
});

describe("TracerWrapper", () => {
  beforeEach(() => {
    process.env["AWS_LAMBDA_FUNCTION_NAME"] = "my-lambda";
    mockNoTracer = false;
    mockTracerInitialised = true;
    mockSpan = null;
    mockDataStreamsCheckpointer.setConsumeCheckpoint.mockClear();
  });
  afterEach(() => {
    jest.resetModules();
    delete process.env["AWS_LAMBDA_FUNCTION_NAME"];
    delete process.env["DD_DATA_STREAMS_ENABLED"];
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
    const extractedTraceContext = wrapper.extract({})?.spanContext;
    expect(extractedTraceContext).toBe(mockSpanContext);
  });
  it("shouldn't extract span context when dd-trace is absent", () => {
    mockNoTracer = true;
    const wrapper = new TracerWrapper();
    expect(wrapper.extract({})).toBeNull();
  });

  it("should find the current span context", () => {
    mockSpan = {
      context: () => ({
        toSpanId: () => "1234",
        toTraceId: () => "45678",
        _sampling: {
          priority: "2",
        },
      }),
    };
    const wrapper = new TracerWrapper();
    const traceContext = wrapper.traceContext();
    expect(traceContext?.toTraceId()).toBe("45678");
    expect(traceContext?.toSpanId()).toBe("1234");
    expect(traceContext?.sampleMode()).toBe("2");
    expect(traceContext?.source).toBe("ddtrace");
  });
  it("should return NULL when no span is available", () => {
    const wrapper = new TracerWrapper();
    const traceContext = wrapper.traceContext();
    expect(traceContext).toBeNull();
  });
  it("should not call internal setConsumeCheckpoint when arn is not provided", () => {
    process.env["DD_DATA_STREAMS_ENABLED"] = "true";
    const wrapper = new TracerWrapper();

    wrapper.setConsumeCheckpoint({ test: "context" }, "kinesis", "");

    expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).not.toHaveBeenCalled();
  });

  it("should call internal setConsumeCheckpoint when DD_DATA_STREAMS_ENABLED is on and arn is provided", () => {
    process.env["DD_DATA_STREAMS_ENABLED"] = "true";
    const wrapper = new TracerWrapper();
    const contextJson = { test: "context" };
    const eventType = "kinesis";
    const arn = "arn:aws:kinesis:us-east-1:123456789:stream/test-stream";

    wrapper.setConsumeCheckpoint(contextJson, eventType, arn);

    expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledWith(eventType, arn, contextJson);
  });

  it("should not call internal setConsumeCheckpoint when DD_DATA_STREAMS_ENABLED is off", () => {
    process.env["DD_DATA_STREAMS_ENABLED"] = "false";
    const wrapper = new TracerWrapper();
    const contextJson = { test: "context" };
    const eventType = "kinesis";
    const arn = "arn:aws:kinesis:us-east-1:123456789:stream/test-stream";

    wrapper.setConsumeCheckpoint(contextJson, eventType, arn);

    expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).not.toHaveBeenCalled();
  });
});
