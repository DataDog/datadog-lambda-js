import { SampleMode } from "./context/extractor";
import {
  convertToAPMParentID,
  convertToAPMTraceID,
  convertToSampleMode,
  readTraceContextFromXray,
} from "./xray-service";

describe("readTraceContextFromXray", () => {
  afterEach(() => {
    process.env["_X_AMZN_TRACE_ID"] = undefined;
  });
  it("returns a trace context from a valid env var", () => {
    process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
    const context = readTraceContextFromXray();
    expect(context).toEqual({
      parentID: "10713633173203262661",
      sampleMode: 2,
      source: "xray",
      traceID: "3995693151288333088",
    });
  });
  it("returns undefined when given an invalid env var", () => {
    const badCases = [
      "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5",
      "Root=1-5e272390-8c398be037738dc042009320",
      "1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1",
      "Root=1-5e272390-8c398be037738dc042009320;94ae789b969f1cc5;Sampled=1",
      "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;1",
      "Root=a;Parent=94ae789b969f1cc5;Sampled=1",
      "Root=1-5e272390-8c398be037738dc042009320;Parent=b;Sampled=1",
      undefined,
    ];
    for (const badCase of badCases) {
      process.env["_X_AMZN_TRACE_ID"] = badCase;
      expect(readTraceContextFromXray()).toBeUndefined();
    }
  });
});

describe("convertToAPMTraceID", () => {
  it("converts an xray trace id to a Datadog trace ID", () => {
    const xrayTraceID = "1-5ce31dc2-2c779014b90ce44db5e03875";
    const traceID = convertToAPMTraceID(xrayTraceID);
    expect(traceID).toEqual("4110911582297405557");
  });
  it("converts an xray trace id to a Datadog trace ID removing first bit", () => {
    const xrayTraceID = "1-5ce31dc2-ac779014b90ce44db5e03875"; // Number with 64bit toggled on
    const traceID = convertToAPMTraceID(xrayTraceID);
    expect(traceID).toEqual("4110911582297405557");
  });
  it("returns undefined when xray trace id is too short", () => {
    const xrayTraceID = "1-5ce31dc2-5e03875";
    const traceID = convertToAPMTraceID(xrayTraceID);
    expect(traceID).toBeUndefined();
  });

  it("returns undefined when xray trace id is in an invalid format", () => {
    const xrayTraceID = "1-2c779014b90ce44db5e03875";
    const traceID = convertToAPMTraceID(xrayTraceID);
    expect(traceID).toBeUndefined();
  });
  it("returns undefined when xray trace id uses invalid characters", () => {
    const xrayTraceID = "1-5ce31dc2-c779014b90ce44db5e03875;";
    const traceID = convertToAPMTraceID(xrayTraceID);
    expect(traceID).toBeUndefined();
  });
});

describe("convertToAPMParentID", () => {
  it("converts an xray parent ID to an APM parent ID", () => {
    const xrayParentID = "0b11cc4230d3e09e";
    const parentID = convertToAPMParentID(xrayParentID);
    expect(parentID).toEqual("797643193680388254");
  });
  it("returns undefined when parent ID uses invalid characters", () => {
    const xrayParentID = ";79014b90ce44db5e0;875";
    const parentID = convertToAPMParentID(xrayParentID);
    expect(parentID).toBeUndefined();
  });
  it("returns undefined when parent ID is wrong size", () => {
    const xrayParentID = "5e03875";
    const parentID = convertToAPMParentID(xrayParentID);
    expect(parentID).toBeUndefined();
  });
});

describe("convertToSampleMode", () => {
  it("returns USER_KEEP if xray was sampled", () => {
    const result = convertToSampleMode(1);
    expect(result).toBe(SampleMode.USER_KEEP);
  });
  it("returns USER_REJECT if xray wasn't sampled", () => {
    const result = convertToSampleMode(0);
    expect(result).toBe(SampleMode.USER_REJECT);
  });
});
