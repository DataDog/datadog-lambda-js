import { randomBytes } from "crypto";
import { logDebug, logError } from "../utils";
import { SampleMode, Source, TraceContext } from "./context/extractor";
import { StepFunctionContext } from "./step-function-service";
import { Socket, createSocket } from "dgram";
import BigNumber from "bignumber.js";

export interface XRayTraceHeader {
  traceID: string;
  parentID: string;
  sampled: number;
}

export const xraySubsegmentName = "datadog-metadata";
export const xraySubsegmentKey = "trace";
export const xrayBaggageSubsegmentKey = "root_span_metadata";
export const xrayLambdaFunctionTagsKey = "lambda_function_tags";
export const xraySubsegmentNamespace = "datadog";
export const xrayTraceEnvVar = "_X_AMZN_TRACE_ID";
export const awsXrayDaemonAddressEnvVar = "AWS_XRAY_DAEMON_ADDRESS";

export function addTraceContextToXray(traceContext: TraceContext) {
  const val = {
    "parent-id": traceContext.parentID,
    "sampling-priority": traceContext.sampleMode.toString(10),
    "trace-id": traceContext.traceID,
  };

  addXrayMetadata(xraySubsegmentKey, val);
}

export function addStepFunctionContextToXray(context: StepFunctionContext) {
  addXrayMetadata(xrayBaggageSubsegmentKey, context);
}

export function addLambdaFunctionTagsToXray(triggerTags: { [key: string]: string }) {
  addXrayMetadata(xrayLambdaFunctionTagsKey, triggerTags);
}

export function addXrayMetadata(key: string, metadata: Record<string, any>) {
  const segment = generateXraySubsegment(key, metadata);
  if (segment === undefined) {
    return;
  }
  sendXraySubsegment(segment);
}

export function generateXraySubsegment(key: string, metadata: Record<string, any>) {
  const header = process.env[xrayTraceEnvVar];
  if (header === undefined) {
    logDebug("couldn't read xray trace header from env");
    return;
  }
  const context = parseXrayTraceContextHeader(header);
  if (context === undefined) {
    logDebug("couldn't parse xray trace header from env");
    return;
  }
  const sampled = convertToSampleMode(parseInt(context.xraySampled, 10));
  if (sampled === SampleMode.USER_REJECT || sampled === SampleMode.AUTO_REJECT) {
    logDebug("discarding xray metadata subsegment due to sampling");
    return;
  }

  // Convert from milliseconds to seconds
  const time = Date.now() * 0.001;

  return JSON.stringify({
    id: randomBytes(8).toString("hex"),
    trace_id: context.xrayTraceID,
    parent_id: context.xrayParentID,
    name: xraySubsegmentName,
    start_time: time,
    end_time: time,
    type: "subsegment",
    metadata: {
      [xraySubsegmentNamespace]: {
        [key]: metadata,
      },
    },
  });
}

export function sendXraySubsegment(segment: string) {
  const xrayDaemonEnv = process.env[awsXrayDaemonAddressEnvVar];
  if (xrayDaemonEnv === undefined) {
    logDebug("X-Ray daemon env var not set, not sending sub-segment");
    return;
  }
  const parts = xrayDaemonEnv.split(":");
  if (parts.length <= 1) {
    logDebug("X-Ray daemon env var has invalid format, not sending sub-segment");
    return;
  }
  const port = parseInt(parts[1], 10);
  const address = parts[0];

  const message = Buffer.from(`{\"format\": \"json\", \"version\": 1}\n${segment}`);
  let client: Socket | undefined;
  try {
    client = createSocket("udp4");
    // Send segment asynchronously to xray daemon
    client.send(message, 0, message.length, port, address, (error, bytes) => {
      client?.close();
      logDebug(`Xray daemon received metadata payload`, { error, bytes });
    });
  } catch (error) {
    if (error instanceof Error) {
      client?.close();
      logDebug("Error occurred submitting to xray daemon", error);
    }
  }
}

export function readTraceContextFromXray(): TraceContext | undefined {
  const header = process.env[xrayTraceEnvVar];
  if (header === undefined) {
    logDebug("couldn't read xray trace header from env");
    return;
  }
  const context = parseXrayTraceContextHeader(header);

  if (context === undefined) {
    logError("couldn't read xray trace context from env, variable had invalid format");
    return undefined;
  }
  const parentID = convertToAPMParentID(context.xrayParentID);
  if (parentID === undefined) {
    logDebug("couldn't parse xray parent ID", context);
    return;
  }
  const traceID = convertToAPMTraceID(context.xrayTraceID);
  if (traceID === undefined) {
    logDebug("couldn't parse xray trace ID", context);
    return;
  }
  const sampleMode = convertToSampleMode(parseInt(context.xraySampled, 10));

  const trace = {
    parentID,
    sampleMode,
    source: Source.Xray,
    traceID,
  };
  logDebug(`extracted trace context from xray context`, { trace, header });
  return trace;
}

function parseXrayTraceContextHeader(header: string) {
  // Example: Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1
  logDebug(`Reading trace context from env var ${header}`);
  const [root, parent, sampled] = header.split(";");
  if (parent === undefined || sampled === undefined) {
    return;
  }
  const [, xrayTraceID] = root.split("=");
  const [, xrayParentID] = parent.split("=");
  const [, xraySampled] = sampled.split("=");
  if (xraySampled === undefined || xrayParentID === undefined || xrayTraceID === undefined) {
    return;
  }
  return {
    xrayTraceID,
    xraySampled,
    xrayParentID,
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
