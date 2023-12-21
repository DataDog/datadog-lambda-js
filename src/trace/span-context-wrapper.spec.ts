import { SpanContextWrapper } from "./span-context-wrapper";
import { TraceSource } from "./trace-context-service";

describe("SpanContextWrapper", () => {
  beforeEach(() => {});

  it("fromTraceContext", () => {
    const traceContext = {
      traceId: "8768810343773813232",
      parentId: "6918894271950871724",
      sampleMode: 1,
      source: TraceSource.Event,
    };
    const spanContext = SpanContextWrapper.fromTraceContext(traceContext);

    expect(spanContext?.toTraceId()).toBe("8768810343773813232");
    expect(spanContext?.toSpanId()).toBe("6918894271950871724");
    expect(spanContext?.sampleMode()).toBe("1");
    expect(spanContext?.source).toBe("event");
    expect(spanContext?.spanContext._traceId.toArray()).toEqual([121, 177, 18, 140, 107, 104, 185, 240]);
    expect(spanContext?.spanContext._spanId.toArray()).toEqual([96, 4, 217, 174, 182, 29, 220, 172]);
  });
});
