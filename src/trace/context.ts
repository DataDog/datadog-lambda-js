import { BigNumber } from "bignumber.js";
import { randomBytes } from "crypto";
import { createSocket } from "dgram";

import { logDebug, logError } from "../utils";
import {
  parentIDHeader,
  SampleMode,
  samplingPriorityHeader,
  Source,
  traceIDHeader,
  xrayBaggageSubsegmentKey,
  xraySubsegmentKey,
  xraySubsegmentName,
  xraySubsegmentNamespace,
  xrayTraceEnvVar,
  awsXrayDaemonAddressEnvVar,
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
  source: Source;
}

export interface StepFunctionContext {
  "step_function.retry_count": number;
  "step_function.execution_id": string;
  "step_function.state_machine_name": string;
  "step_function.state_machine_arn": string;
  "step_function.step_name": string;
}

/**
 * Reads the trace context from either an incoming lambda event, or the current xray segment.
 * @param event An incoming lambda event. This must have incoming trace headers in order to be read.
 */
export function extractTraceContext(event: any) {
  const trace = readTraceFromEvent(event);
  const stepFuncContext = readStepFunctionContextFromEvent(event);
  if (stepFuncContext) {
    try {
      addStepFunctionContextToXray(stepFuncContext);
    } catch (error) {
      logError("couldn't add step function metadata to xray", { innerError: error });
    }
  }
  if (trace !== undefined) {
    try {
      addTraceContextToXray(trace);
    } catch (error) {
      // This might fail if running in an environment where xray isn't set up, (like for local development).
      logError("couldn't add metadata to xray", { innerError: error });
    }
    return trace;
  }
  return readTraceContextFromXray();
}

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
  const time = Date.now();

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

  const message = new Buffer(`{\"format\": \"json\", \"version\": 1}\n${segment}`);
  try {
    const client = createSocket("udp4");
    // Send segment asynchronously to xray daemon
    client.send(message, 0, message.length, port, address, (error, bytes) => {
      logDebug(`Xray daemon received metadata payload`, { error, bytes });
    });
  } catch (error) {
    logDebug("Error occurred submitting to xray daemon", { error });
  }
}

export function readTraceFromEvent(event: any): TraceContext | undefined {
  if (typeof event !== "object") {
    return;
  }
  const headers = event.headers;

  // e.g. When lambda is invoked synchronously, headers can be set to null by the caller
  if (!headers || typeof headers !== "object") {
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
    source: Source.Event,
    traceID,
  };
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

  return {
    parentID,
    sampleMode,
    source: Source.Xray,
    traceID,
  };
}

export function parseXrayTraceContextHeader(header: string) {
  // Example: Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1
  logDebug(`Reading trace context from env var ${header}`);
  const [root, parent, sampled] = header.split(";");
  if (parent === undefined || sampled === undefined) {
    return;
  }
  const [, xrayTraceID] = root.split("=");
  if (xrayTraceID === undefined) {
    return;
  }

  const [, xrayParentID] = parent.split("=");
  if (xrayParentID === undefined) {
    return;
  }

  const [, xraySampled] = sampled.split("=");
  if (xraySampled === undefined) {
    return;
  }
  return {
    xrayTraceID,
    xraySampled,
    xrayParentID,
  };
}

export function readStepFunctionContextFromEvent(event: any): StepFunctionContext | undefined {
  if (typeof event !== "object") {
    return;
  }
  const { dd } = event;
  if (typeof dd !== "object") {
    return;
  }
  const execution = dd.Execution;
  if (typeof execution !== "object") {
    return;
  }
  const executionID = execution.Name;
  if (typeof executionID !== "string") {
    return;
  }
  const state = dd.State;
  if (typeof state !== "object") {
    return;
  }
  const retryCount = state.RetryCount;
  if (typeof retryCount !== "number") {
    return;
  }
  const stepName = state.Name;
  if (typeof stepName !== "string") {
    return;
  }
  const stateMachine = dd.StateMachine;
  if (typeof stateMachine !== "object") {
    return;
  }
  const stateMachineArn = stateMachine.Id;
  if (typeof stateMachineArn !== "string") {
    return;
  }
  const stateMachineName = stateMachine.Name;
  if (typeof stateMachineName !== "string") {
    return;
  }
  return {
    "step_function.execution_id": executionID,
    "step_function.retry_count": retryCount,
    "step_function.state_machine_arn": stateMachineArn,
    "step_function.state_machine_name": stateMachineName,
    "step_function.step_name": stepName,
  };
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
    source: Source.Xray,
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
