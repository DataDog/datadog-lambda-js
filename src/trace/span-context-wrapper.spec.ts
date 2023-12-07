import { SpanContextWrapper } from "./span-context-wrapper";
import { TraceSource } from "./trace-context-service";

describe("SpanContextWrapper", () => {
  beforeEach(() => {});

  it("fromTraceContext", () => {
    const traceContext = {
      traceId: "8768810343773813232",
      parentId: "6004d9aeb61ddcac",
      sampleMode: 1,
      source: TraceSource.Event,
    };
    const spanContext = SpanContextWrapper.fromTraceContext(traceContext);

    expect(spanContext?.toTraceId()).toBe("8768810343773813232");
    expect(spanContext?.toSpanId()).toBe("6004d9aeb61ddcac");
    expect(spanContext?.sampleMode()).toBe("1");
    expect(spanContext?.source).toBe("event");
    // The inner type dd-trace/packages/dd-trace/src/opentracing/span_context
    // must have traceId and spanId as objects instead of strings because of the toArray() call
    // https://github.com/DataDog/dd-trace-js/blob/9c71b3060081a77639bab4c6b2a26c952f4a114f/packages/dd-trace/src/encode/0.4.js#L168
    expect(spanContext?.spanContext._traceId).toBeInstanceOf(Object);
    expect(spanContext?.spanContext._spanId).toBeInstanceOf(Object);
  });
});
