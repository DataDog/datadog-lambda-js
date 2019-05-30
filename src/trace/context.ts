import { BigNumber } from "bignumber.js";

export interface XRayTraceHeader {
  traceID: string;
  parentID: string;
  sampled: number;
}

export interface TraceContext {
  traceID: string;
  parentID: string;
  sampled: number;
}

export enum SampleMode {
  USER_REJECT = "-1",
  AUTO_REJECT = "0",
  AUTO_KEEP = "1",
  USER_KEEP = "2",
}

const traceHeaderPrefix = "X-Amzn-Trace-Id:";
const traceIDTag = "Root";
const parentIDTag = "Parent";
const sampledTag = "Sampled";

export function convertTraceContext(traceHeader: XRayTraceHeader): TraceContext {
  throw new Error("Unimplemented");
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
