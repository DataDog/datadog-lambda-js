import { SampleMode, Source } from "../extractor";
import { readTraceFromHTTPEvent } from "./http";

describe("readTraceFromHTTPEvent", () => {
  it("can read well formed event with headers", () => {
    const result = readTraceFromHTTPEvent({
      headers: {
        "x-datadog-parent-id": "797643193680388254",
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "4110911582297405557",
      },
    });
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
      source: Source.Event,
    });
  });
  it("can read well formed headers with mixed casing", () => {
    const result = readTraceFromHTTPEvent({
      headers: {
        "X-Datadog-Parent-Id": "797643193680388254",
        "X-Datadog-Sampling-Priority": "2",
        "X-Datadog-Trace-Id": "4110911582297405557",
      },
    });
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
      source: Source.Event,
    });
  });
});
