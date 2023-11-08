import { SampleMode, Source } from "../extractor";
import { readTraceFromLambdaContext } from "./lambda-context";

describe("readTraceFromLambdaContext", () => {
  it("can read from lambda context source, legacy style", () => {
    const result = readTraceFromLambdaContext({
      clientContext: {
        custom: {
          _datadog: {
            "x-datadog-trace-id": "666",
            "x-datadog-parent-id": "777",
            "x-datadog-sampled": "1",
            "x-datadog-sampling-priority": "1",
          },
        },
      },
    });
    expect(result).toEqual({
      parentID: "777",
      sampleMode: SampleMode.AUTO_KEEP,
      traceID: "666",
      source: Source.Event,
    });
  });
  it("can read from lambda context source, new style", () => {
    const result = readTraceFromLambdaContext({
      clientContext: {
        custom: {
          "x-datadog-trace-id": "666",
          "x-datadog-parent-id": "777",
          "x-datadog-sampled": "1",
          "x-datadog-sampling-priority": "1",
        },
      },
    });
    expect(result).toEqual({
      parentID: "777",
      sampleMode: SampleMode.AUTO_KEEP,
      traceID: "666",
      source: Source.Event,
    });
  });
  it("can handle no `custom` key", () => {
    const result = readTraceFromLambdaContext({
      clientContext: {
        foo: "bar",
      },
    });
    expect(result).toBeUndefined();
  });
  it("can handle a string `custom` key", () => {
    const result = readTraceFromLambdaContext({
      clientContext: {
        custom: "bar",
      },
    });
    expect(result).toBeUndefined();
  });
  it("can handle no context", () => {
    const result = readTraceFromLambdaContext(undefined);
    expect(result).toBeUndefined();
  });
});
