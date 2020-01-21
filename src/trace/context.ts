import { captureFunc, getSegment } from "aws-xray-sdk-core";
import { BigNumber } from "bignumber.js";

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

  captureFunc(xraySubsegmentName, (segment) => {
    segment.addMetadata(xraySubsegmentKey, val, xraySubsegmentNamespace);
  });
}

export function addStepFunctionContextToXray(context: StepFunctionContext) {
  captureFunc(xraySubsegmentName, (segment) => {
    segment.addMetadata(xrayBaggageSubsegmentKey, context, xraySubsegmentNamespace);
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
    source: Source.Event,
    traceID,
  };
}

export function readTraceContextFromXray() {
  try {
    const segment = getSegment();
    logDebug(`Setting X-Ray parent trace to segment with ${segment.id} and trace ${segment.trace_id}`);
    const traceHeader = {
      parentID: segment.id,
      sampled: segment.notTraced ? 0 : 1,
      traceID: segment.trace_id,
    };
    const contextFromSegment = convertTraceContext(traceHeader);
    const contextFromEnv = readTraceContextFromXrayEnv();
    // Due to a bug with the x-ray sdk's async await support, sometimes the X-Ray SDK will incorrectly report segments
    // from previous traces. The x-ray trace environment variable usually has the correct trace id, but might not have
    // the most recent parent segment. If the segment is from the wrong trace, we will use the trace context read from
    // the environment instead.
    if (contextFromSegment?.traceID !== contextFromEnv?.traceID && contextFromEnv !== undefined) {
      logDebug(
        `Trace ID from X-Ray SDK ${contextFromSegment?.traceID} didn't match traceID from x-ray env var ${contextFromEnv?.traceID}. Using env var trace context instead`,
      );
      return contextFromEnv;
    }
    return contextFromSegment;
  } catch (error) {
    logError("couldn't read xray trace header", { innerError: error });
  }
  return undefined;
}

export function readTraceContextFromXrayEnv(): TraceContext | undefined {
  const header = process.env[xrayTraceEnvVar];
  if (header === undefined) {
    return;
  }
  return parseTraceContextHeader(header);
}

export function parseTraceContextHeader(header: string): TraceContext | undefined {
  // Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1
  logDebug(`Reading trace context from env var ${header}`);
  const [root, parent, sampled] = header.split(";");
  if (parent === undefined || sampled === undefined) {
    return;
  }
  const [, rawTraceID] = root.split("=");
  if (rawTraceID === undefined) {
    return;
  }
  const traceID = convertToAPMTraceID(rawTraceID);
  if (traceID === undefined) {
    return;
  }
  const [, rawParentID] = parent.split("=");
  if (rawParentID === undefined) {
    return;
  }
  const parentID = convertToAPMParentID(rawParentID);
  if (parentID === undefined) {
    return;
  }
  const [, rawSampled] = sampled.split("=");
  if (rawSampled === undefined) {
    return;
  }
  const sampleMode = convertToSampleMode(parseInt(rawSampled, 10));
  return {
    parentID,
    sampleMode,
    source: Source.Xray,
    traceID,
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
