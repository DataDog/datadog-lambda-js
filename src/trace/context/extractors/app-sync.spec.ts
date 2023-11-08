import { SampleMode, Source, readTraceFromEvent } from "../extractor";

describe("readTraceFromAppSyncEvent", () => {
  it("can read from appsync source", () => {
    const result = readTraceFromEvent({
      info: {
        selectionSetGraphQL: "{ items }",
      },
      request: {
        headers: {
          "x-datadog-parent-id": "797643193680388254",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "4110911582297405557",
        },
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
