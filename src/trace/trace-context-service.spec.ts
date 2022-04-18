import { TraceContextService } from "./trace-context-service";
import { TraceContext } from "./context";
import { SampleMode, Source } from "./constants";

let mockXRaySegment: any;
let mockXRayShouldThrow = false;

describe("TraceContextService", () => {
  let traceContextService: TraceContextService;
  let datadogTraceContext: TraceContext | undefined;
  beforeEach(() => {
    datadogTraceContext = undefined;
    mockXRaySegment = undefined;
    mockXRayShouldThrow = false;
    const traceWrapper = {
      traceContext: () => datadogTraceContext,
    };
    traceContextService = new TraceContextService(traceWrapper as any);
  });

  it("uses datadog trace parent id by default", () => {
    datadogTraceContext = {
      traceID: "123456",
      parentID: "78910",
      sampleMode: SampleMode.AUTO_KEEP,
      source: Source.Event,
    };
    traceContextService["rootTraceContext"] = {
      traceID: "123456",
      parentID: "abcdef",
      sampleMode: SampleMode.AUTO_KEEP,
      source: Source.Event,
    };
    expect(traceContextService.currentTraceContext).toEqual({
      traceID: "123456",
      parentID: "78910",
      sampleMode: SampleMode.AUTO_KEEP,
      source: Source.Event,
    });
  });
  it("uses parent trace parent id when trace id is invalid", () => {
    mockXRayShouldThrow = true;
    mockXRaySegment = {
      id: "0b11cc",
    };
    traceContextService["rootTraceContext"] = {
      traceID: "123456",
      parentID: "abcdef",
      sampleMode: SampleMode.AUTO_KEEP,
      source: Source.Xray,
    };
    expect(traceContextService.currentTraceContext).toEqual({
      traceID: "123456",
      parentID: "abcdef",
      sampleMode: SampleMode.AUTO_KEEP,
      source: Source.Xray,
    });
  });
  it("uses parent trace parent id when no datadog trace context is available and xray throws", () => {
    mockXRayShouldThrow = true;
    traceContextService["rootTraceContext"] = {
      traceID: "123456",
      parentID: "abcdef",
      sampleMode: SampleMode.AUTO_KEEP,
      source: Source.Xray,
    };
    expect(traceContextService.currentTraceContext).toEqual({
      traceID: "123456",
      parentID: "abcdef",
      sampleMode: SampleMode.AUTO_KEEP,
      source: Source.Xray,
    });
  });
});
