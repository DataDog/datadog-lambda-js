import { captureFunc, getSegment } from "aws-xray-sdk-core";
import { BigNumber } from "bignumber.js";

import { logError } from "../utils";
import {
  parentIDHeader,
  SampleMode,
  samplingPriorityHeader,
  traceIDHeader,
  xraySubsegmentKey,
  xraySubsegmentName,
  xraySubsegmentNamespace,
} from "./constants";
import { getEventSource } from "./event-source";

export interface XRayTraceHeader {
  traceID: string;
  parentID: string;
  sampled: number;
}

export interface TraceContext {
  traceID: string;
  parentID: string;
  sampleMode: SampleMode;
}

/**
 * Reads the trace context from either an incoming lambda event, or the current xray segment.
 * @param event An incoming lambda event. This must have incoming trace headers in order to be read.
 */
export function extractTraceContext(event: any) {
  const trace = readTraceFromEvent(event);
  const eventType = getEventSource(event);
  try {
    addTraceContextToXray(eventType, trace);
  } catch (error) {
    // This might fail if running in an environment where xray isn't set up, (like for local development).
    logError("couldn't add metadata to xray", { innerError: error });
  }
  if (trace !== undefined) {
    return trace;
  }
  return readTraceContextFromXray();
}

export function addTraceContextToXray(eventType: string, traceContext?: TraceContext) {
  let val: Record<string, string> = {
    "event-source": eventType,
  };
  if (traceContext !== undefined) {
    val = {
      ...val,
      "parent-id": traceContext.parentID,
      "sampling-priority": traceContext.sampleMode.toString(10),
      "trace-id": traceContext.traceID,
    };
  }
  captureFunc(xraySubsegmentName, (segment) => {
    segment.addMetadata(xraySubsegmentKey, val, xraySubsegmentNamespace);
  });
}

export function readTraceFromEvent(event: any): TraceContext | undefined {
  if (typeof event !== "object") {
    return;
  }
  const headers = event.headers;

  if (typeof headers !== "object") {
    return;
  }

  const lowerCaseHeaders: { [key: string]: string } = {};

  for (const key of Object.keys(headers)) {
    lowerCaseHeaders[key.toLocaleLowerCase()] = headers[key];
  }

  const traceID = lowerCaseHeaders[traceIDHeader];
  if (typeof traceID !== "string") {
    return;
  }
  const parentID = lowerCaseHeaders[parentIDHeader];
  if (typeof parentID !== "string") {
    return;
  }
  const sampledHeader = lowerCaseHeaders[samplingPriorityHeader];
  if (typeof sampledHeader !== "string") {
    return;
  }
  const sampleMode = parseInt(sampledHeader, 10);

  return {
    parentID,
    sampleMode,
    traceID,
  };
}

export function readTraceContextFromXray() {
  try {
    const segment = getSegment();
    const traceHeader = {
      parentID: segment.id,
      sampled: segment.notTraced ? 0 : 1,
      traceID: segment.trace_id,
    };
    return convertTraceContext(traceHeader);
  } catch (error) {
    logError("couldn't read xray trace header", { innerError: error });
  }
  return undefined;
}

export function convertTraceContext(traceHeader: XRayTraceHeader): TraceContext | undefined {
  const sampleMode = convertToSampleMode(traceHeader.sampled);
  const traceID = convertToAPMTraceID(traceHeader.traceID);
  const parentID = convertToAPMParentID(traceHeader.parentID);
  if (traceID === undefined || parentID === undefined) {
    return;
  }
  return {
    parentID,
    sampleMode,
    traceID,
  };
}

export function convertToSampleMode(xraySampled: number): SampleMode {
  return xraySampled === 1 ? SampleMode.USER_KEEP : SampleMode.USER_REJECT;
}

export function convertToAPMTraceID(xrayTraceID: string): string | undefined {
  const parts = xrayTraceID.split("-");
  if (parts.length < 3) {
    return;
  }
  const lastPart = parts[2];
  if (lastPart.length !== 24) {
    return;
  }

  // We want to turn the last 63 bits into a decimal number in a string representation
  // Unfortunately, all numbers in javascript are represented by float64 bit numbers, which
  // means we can't parse 64 bit integers accurately.
  const hex = new BigNumber(lastPart, 16);
  if (hex.isNaN()) {
    return;
  }
  // Toggle off the 64th bit
  const last63Bits = hex.mod(new BigNumber("8000000000000000", 16));
  return last63Bits.toString(10);
}

export function convertToAPMParentID(xrayParentID: string): string | undefined {
  if (xrayParentID.length !== 16) {
    return;
  }
  const hex = new BigNumber(xrayParentID, 16);
  if (hex.isNaN()) {
    return;
  }
  return hex.toString(10);
}
