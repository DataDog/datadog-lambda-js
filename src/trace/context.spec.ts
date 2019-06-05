import AWSXray from "aws-xray-sdk-core";

import { SampleMode } from "./constants";
import {
    convertToAPMParentID, convertToAPMTraceID, convertToSampleMode, convertTraceContext,
    extractTraceContext, readTraceContextFromXray, readTraceFromEvent
} from "./context";

let currentSegment: any;

jest.mock("aws-xray-sdk-core", () => {
  return {
    captureFunc: () => {
      throw Error("Unimplemented");
    },
    getSegment: () => {
      if (currentSegment === undefined) {
        throw Error("Empty");
      }
      return currentSegment;
    },
  };
});

beforeEach(() => {
  currentSegment = undefined;
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

describe("readTraceContextFromXray", () => {
  it("will parse a trace context from the xray", () => {
    currentSegment = {
      id: "0b11cc4230d3e09e",
      trace_id: "1-5ce31dc2-2c779014b90ce44db5e03875",
    };

    const traceContext = readTraceContextFromXray();
    expect(traceContext).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
    });
  });
  it("will parse a trace context from the xray, with sampling turned off", () => {
    currentSegment = {
      id: "0b11cc4230d3e09e",
      notTraced: true,
      trace_id: "1-5ce31dc2-2c779014b90ce44db5e03875",
    };

    const traceContext = readTraceContextFromXray();
    expect(traceContext).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_REJECT,
      traceID: "4110911582297405557",
    });
  });
  it("returns undefined when trace header isn't in environment", () => {
    const traceContext = readTraceContextFromXray();
    expect(traceContext).toBeUndefined();
  });
});

describe("readTraceFromEvent", () => {
  it("can read well formed event with headers", () => {
    const result = readTraceFromEvent({
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
    });
  });
  it("returns undefined when missing trace id", () => {
    const result = readTraceFromEvent({
      headers: {
        "x-datadog-parent-id": "797643193680388254",
        "x-datadog-sampling-priority": "2",
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when missing parent id", () => {
    const result = readTraceFromEvent({
      headers: {
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "4110911582297405557",
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when missing sampling priority id", () => {
    const result = readTraceFromEvent({
      headers: {
        "x-datadog-parent-id": "797643193680388254",
        "x-datadog-trace-id": "4110911582297405557",
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when missing headers value", () => {
    const result = readTraceFromEvent({});
    expect(result).toBeUndefined();
  });
  it("returns undefined when event isn't object", () => {
    const result = readTraceFromEvent("some-value");
    expect(result).toBeUndefined();
  });
});
describe("extractTraceContext", () => {
  it("returns trace read from header as highest priority", () => {
    currentSegment = {
      parent_id: "0b11cc4230d3e09e",
      trace_id: "1-5ce31dc2-2c779014b90ce44db5e03875",
    };

    const result = extractTraceContext({
      headers: {
        "x-datadog-parent-id": "797643193680388251",
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "4110911582297405551",
      },
    });
    expect(result).toEqual({
      parentID: "797643193680388251",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405551",
    });
  });
  it("returns trace read from env if no headers present", () => {
    currentSegment = {
      id: "0b11cc4230d3e09e",
      trace_id: "1-5ce31dc2-2c779014b90ce44db5e03875",
    };

    const result = extractTraceContext({});
    expect(result).toEqual({
      parentID: "797643193680388254",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "4110911582297405557",
    });
  });
});
