import { BigNumber } from "bignumber.js";
import {
  parentIDHeader,
  parentIDTag,
  sampledTag,
  SampleMode,
  samplingPriorityHeader,
  traceEnvVar,
  traceHeaderPrefix,
  traceIDHeader,
  traceIDTag,
} from "./constants";

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
 * Reads the trace context from either an incoming lambda event, or the process environment.
 * @param event An incoming lambda event. This must have incoming trace headers in order to be read.
 * @param env The process environment that may contain an xray trace id environment variable. This we be used
 *  if the event doesn't contain trace headers.
 */
export function readTraceContext(event: any, env: NodeJS.ProcessEnv) {
  const trace = readTraceFromEvent(event);
  if (trace !== undefined) {
    return trace;
  }
  return readTraceContextFromEnvironment(env);
}

export function readTraceFromEvent(event: any): TraceContext | undefined {
  if (typeof event !== "object") {
    return;
  }
  const headers = event.headers;

  if (typeof headers !== "object") {
    return;
  }
  const traceID = headers[traceIDHeader];
  if (typeof traceID !== "string") {
    return;
  }
  const parentID = headers[parentIDHeader];
  if (typeof parentID !== "string") {
    return;
  }
  const sampledHeader = headers[samplingPriorityHeader];
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

export function readTraceContextFromEnvironment(env: NodeJS.ProcessEnv) {
  const traceEnv = env[traceEnvVar];
  if (traceEnv === undefined) {
    return;
  }
  const traceHeader = parseTraceHeader(traceEnv);
  if (traceHeader === undefined) {
    return;
  }
  return convertTraceContext(traceHeader);
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

export function parseTraceHeader(traceHeader: string): XRayTraceHeader | undefined {
  if (!traceHeader.startsWith(traceHeaderPrefix)) {
    return;
  }
  traceHeader = traceHeader.substring(traceHeaderPrefix.length);
  const parts = traceHeader.split(";");
  const map = new Map<string, string>();
  for (const part of parts) {
    if (part.indexOf("=") === Number.NaN) {
      continue;
    }
    const [key, value] = part.trim().split("=");
    map.set(key, value);
  }

  const traceID = map.get(traceIDTag);
  const parentID = map.get(parentIDTag);
  const sampledStr = map.get(sampledTag);

  if (traceID === undefined || parentID === undefined || sampledStr === undefined) {
    return;
  }
  const sampled = parseInt(sampledStr, 10);
  return {
    parentID,
    sampled,
    traceID,
  };
}
