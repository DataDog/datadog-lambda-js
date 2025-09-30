import { TraceContextService, TraceSource } from "./trace-context-service";
import { SpanContextWrapper } from "./span-context-wrapper";

let mockXRaySegment: any;
let mockXRayShouldThrow = false;
let traceContextService: TraceContextService;
let spanContextWrapper: SpanContextWrapper;
let spanContext: any;

describe("TraceContextService", () => {
  beforeEach(() => {
    spanContextWrapper = undefined as any;
    mockXRaySegment = undefined;
    mockXRayShouldThrow = false;
    const traceWrapper = {
      traceContext: () => spanContextWrapper,
    };
    traceContextService = new TraceContextService(traceWrapper as any, {} as any);
  });

  it("uses datadog trace parent id by default", () => {
    spanContext = {
      toTraceId: () => "123456",
      toSpanId: () => "78910",
    };
    spanContextWrapper = {
      toTraceId: () => "123456",
      toSpanId: () => "78910",
      sampleMode: () => 1,
      source: TraceSource.Event,
      spanContext: spanContext,
    };
    traceContextService["rootTraceContext"] = {
      toTraceId: () => "123456",
      toSpanId: () => "abcdef",
      sampleMode: () => 1,
      source: TraceSource.Event,
      spanContext: spanContext,
    };

    const currentTraceContext = traceContextService.currentTraceContext;
    expect(currentTraceContext?.toTraceId()).toBe("123456");
    expect(currentTraceContext?.toSpanId()).toBe("78910");
    expect(currentTraceContext?.sampleMode()).toBe(1);
    expect(currentTraceContext?.source).toBe("event");
  });
  it("uses parent trace parent id when trace id is invalid", () => {
    mockXRayShouldThrow = true;
    mockXRaySegment = {
      id: "0b11cc",
    };
    traceContextService["rootTraceContext"] = {
      toTraceId: () => "123456",
      toSpanId: () => "abcdef",
      sampleMode: () => 1,
      source: TraceSource.Xray,
      spanContext: spanContext,
    };

    const currentTraceContext = traceContextService.currentTraceContext;
    expect(currentTraceContext?.toTraceId()).toBe("123456");
    expect(currentTraceContext?.toSpanId()).toBe("abcdef");
    expect(currentTraceContext?.sampleMode()).toBe(1);
    expect(currentTraceContext?.source).toBe("xray");
  });
  it("uses parent trace parent id when no datadog trace context is available and xray throws", () => {
    mockXRayShouldThrow = true;
    traceContextService["rootTraceContext"] = {
      toTraceId: () => "123456",
      toSpanId: () => "abcdef",
      sampleMode: () => 1,
      source: TraceSource.Xray,
      spanContext: spanContext,
    };

    const currentTraceContext = traceContextService.currentTraceContext;
    expect(currentTraceContext?.toTraceId()).toBe("123456");
    expect(currentTraceContext?.toSpanId()).toBe("abcdef");
    expect(currentTraceContext?.sampleMode()).toBe(1);
    expect(currentTraceContext?.source).toBe("xray");
  });

  it("resets rootTraceContext to prevent caching between invocations", () => {
    // Initial trace context
    traceContextService["rootTraceContext"] = {
      toTraceId: () => "123456",
      toSpanId: () => "abcdef",
      sampleMode: () => 1,
      source: TraceSource.Event,
      spanContext: spanContext,
    };

    expect(traceContextService.currentTraceContext).not.toBeNull();
    expect(traceContextService.traceSource).toBe("event");

    traceContextService.reset();

    expect(traceContextService.currentTraceContext).toBeNull();
    expect(traceContextService.traceSource).toBeNull();
  });

  it("automatically resets trace context at the beginning of extract", async () => {
    // Mock the extractor to return a specific context
    const mockExtract = jest.fn().mockResolvedValue({
      toTraceId: () => "newTraceId",
      toSpanId: () => "newSpanId",
      sampleMode: () => 1,
      source: TraceSource.Event,
      spanContext: {},
    });
    traceContextService["traceExtractor"] = { extract: mockExtract } as any;

    // Set up old trace context (simulating previous invocation)
    traceContextService["rootTraceContext"] = {
      toTraceId: () => "oldTraceId",
      toSpanId: () => "oldSpanId",
      sampleMode: () => 0,
      source: TraceSource.Xray,
      spanContext: {},
    };

    // Extract should reset and set new context
    const result = await traceContextService.extract({}, {} as any);

    // Verify old context was cleared and new context was set
    expect(result?.toTraceId()).toBe("newTraceId");
    expect(traceContextService.traceSource).toBe("event");
  });
});
