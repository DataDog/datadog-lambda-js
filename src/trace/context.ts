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

export interface XRayTraceHeader {
  traceID: string;
  parentID: string;
  sampled: number;
}

export interface BaseTraceContext {
  traceID: string;
  parentID: string;
  sampleMode: SampleMode;
  isStepFunction: boolean;
}

export interface RegularTraceContext extends BaseTraceContext {
  isStepFunction: false;
}
export interface StepFunctionTraceContext extends BaseTraceContext {
  isStepFunction: true;
  executionStartTime: Date;
  retryCount: number;
  stepName: string;
  stateMachineArn: string;
  stateMachineName: string;
  executionID: string;
}

export type TraceContext = RegularTraceContext | StepFunctionTraceContext;

/**
 * Reads the trace context from either an incoming lambda event, or the current xray segment.
 * @param event An incoming lambda event. This must have incoming trace headers in order to be read.
 */
export function extractTraceContext(event: any) {
  let trace = readTraceFromEvent(event);
  if (trace === undefined) {
    trace = readTraceFromStepFunctionEvent(event);
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
    isStepFunction: false,
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

export function readTraceFromStepFunctionEvent(event: any): StepFunctionTraceContext | undefined {
  if (typeof event !== "object") {
    return;
  }
  const { datadogContext } = event;
  if (typeof datadogContext !== "object") {
    return;
  }
  const execution = datadogContext.Execution;
  if (typeof execution !== "object") {
    return;
  }
  const executionID = execution.Name;
  if (typeof executionID !== "string") {
    return;
  }
  const traceID = convertExecutionIDToAPMTraceID(executionID);
  if (traceID === undefined) {
    return;
  }
  const startTime = execution.StartTime;
  if (typeof startTime !== "string") {
    return;
  }
  const executionStartTime = new Date(startTime);

  const state = datadogContext.State;
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
  const stateMachine = datadogContext.StateMachine;
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
    traceID,
    parentID: traceID,
    sampleMode: SampleMode.USER_KEEP,
    isStepFunction: true,
    executionStartTime,
    retryCount,
    stepName,
    stateMachineArn,
    executionID,
    stateMachineName,
  };
}

export function logStepFunctionRootSpan(traceContext: StepFunctionTraceContext) {
  const { stateMachineArn, stateMachineName, executionID } = traceContext;
  const traceID = new BigNumber(traceContext.traceID, 10).toString(16);
  const startDate = traceContext.executionStartTime.valueOf();
  const endDate = Date.now();

  const duration = endDate - startDate;
  const trace = {
    traces: [
      [
        {
          trace_id: traceID,
          span_id: traceID,
          parentID: "0",
          name: `aws.step_function_execution`,
          resource: stateMachineArn,
          error: 0,
          metrics: {
            _sample_rate: 1,
            _sampling_priority_v1: 2,
          },
          meta: {
            "aws.step_function.execution_id": traceContext.executionID,
          },
          start: startDate * 1000000,
          duration: duration * 1000000,
          service: stateMachineName,
        },
      ],
    ],
  };

  process.stdout.write(JSON.stringify(trace) + "\n");
}

export function convertExecutionIDToAPMTraceID(executionId: string, useLast16: boolean = true): string | undefined {
  // fb7b1e15-e4a2-4cb2-863f-8f1fa4aec492
  const parts = executionId.split("-");
  if (parts.length < 5) {
    return;
  }
  const lastParts = useLast16 ? parts[3] + parts[4] : parts[0] + parts[2] + parts[2];
  if (lastParts.length !== 16) {
    return;
  }

  // We want to turn the last 63 bits into a decimal number in a string representation
  // Unfortunately, all numbers in javascript are represented by float64 bit numbers, which
  // means we can't parse 64 bit integers accurately.
  const hex = new BigNumber(lastParts, 16);
  if (hex.isNaN()) {
    return;
  }
  // Toggle off the 64th bit
  const last63Bits = hex.mod(new BigNumber("8000000000000000", 16));
  return last63Bits.toString(10);
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
    isStepFunction: false,
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
