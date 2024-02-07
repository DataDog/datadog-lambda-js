import { SpanContextWrapper } from "./span-context-wrapper";
import { SampleMode, TraceSource } from "./trace-context-service";

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

  describe("sampleMode", () => {
    it("should return AUTO_KEEP when sampling priority is not available in spanContext", () => {
      const spanContext = new SpanContextWrapper(
        {
          toSpanId: () => "1234",
          toTraceId: () => "5678",
          _sampling: {},
        },
        TraceSource.Event,
      );

      const sampleMode = spanContext.sampleMode();
      expect(sampleMode).toBe(SampleMode.AUTO_KEEP);
      expect(sampleMode.toString()).toBe("1");
    });

    it("should return sampling priority when available in spanContext", () => {
      const spanContext = new SpanContextWrapper(
        {
          toSpanId: () => "1234",
          toTraceId: () => "5678",
          _sampling: { priority: 2 },
        },
        TraceSource.Event,
      );

      const sampleMode = spanContext.sampleMode();
      expect(sampleMode).toBe(2);
      expect(sampleMode.toString()).toBe("2");
    });
  });
});
