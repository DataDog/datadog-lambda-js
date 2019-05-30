import {
  convertToAPMParentID,
  convertToAPMTraceID,
  convertToSampleMode,
  parseTraceHeader,
  SampleMode,
  convertTraceContext,
  readTraceContextFromEnvironment,
} from "./context";

describe("parseTraceHeader", () => {
  it("returns undefined if header name is absent", () => {
    const header = "Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1";
    const result = parseTraceHeader(header);
    expect(result).toBeUndefined();
  });
  it('returns undefined if header is missing "Sampled"', () => {
    const header = "X-Amzn-Trace-Id: Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;";
    const result = parseTraceHeader(header);
    expect(result).toBeUndefined();
  });
  it('returns undefined if header is missing "Parent"', () => {
    const header = "X-Amzn-Trace-Id: Root=1-5759e988-bd862e3fe1be46a994272793;Sampled=1";
    const result = parseTraceHeader(header);
    expect(result).toBeUndefined();
  });
  it('returns undefined if header is missing "Root"', () => {
    const header = "X-Amzn-Trace-Id: Parent=53995c3f42cd8ad8;Sampled=1";
    const result = parseTraceHeader(header);
    expect(result).toBeUndefined();
  });
  it("returns undefined if Root is in invalid format", () => {
    const header = "X-Amzn-Trace-Id: Root1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1";
    const result = parseTraceHeader(header);
    expect(result).toBeUndefined();
  });
  it("can parse a well formatted header", () => {
    const header = "X-Amzn-Trace-Id: Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1";
    const result = parseTraceHeader(header);
    expect(result).toEqual({
      parentID: "53995c3f42cd8ad8",
      sampled: 1,
      traceID: "1-5759e988-bd862e3fe1be46a994272793",
    });
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

describe("convertTraceContext", () => {
  it("converts a valid xray trace header", () => {
    const result = convertTraceContext({
      parentID: "0b11cc4230d3e09e",
      sampled: 1,
      traceID: "1-5ce31dc2-ac779014b90ce44db5e03875",
    });
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
    });
  });
  it("returns undefined if traceID is invalid", () => {
    const result = convertTraceContext({
      parentID: "0b11cc4230d3e09e",
      sampled: 1,
      traceID: "1-5ce31dc2",
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined if parentID is invalid", () => {
    const result = convertTraceContext({
      parentID: "0b11cc4230d;09e",
      sampled: 1,
      traceID: "1-5ce31dc2-ac779014b90ce44db5e03875",
    });
    expect(result).toBeUndefined();
  });
});

describe("readTraceContextFromEnvironment", () => {
  it("will parse a trace context from the xray environment variable", () => {
    const env: NodeJS.ProcessEnv = {
      _X_AMZN_TRACE_ID: "X-Amzn-Trace-Id: Root=1-5ce31dc2-2c779014b90ce44db5e03875;Parent=0b11cc4230d3e09e;Sampled=1",
    };
    const traceContext = readTraceContextFromEnvironment(env);
    expect(traceContext).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
    });
  });
  it("returns undefined when trace header isn't in environment", () => {
    const traceContext = readTraceContextFromEnvironment({});
    expect(traceContext).toBeUndefined();
  });
  it("returns undefined when trace header is poorly formatted", () => {
    const traceContext = readTraceContextFromEnvironment({ _X_AMZN_TRACE_ID: "Bad Format" });
    expect(traceContext).toBeUndefined();
  });
});
