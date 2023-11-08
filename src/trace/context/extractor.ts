import { Context } from "aws-lambda";
import { TraceExtractor } from "../listener";
import { logDebug, logError } from "../../utils";
import { readTraceFromHTTPEvent } from "./extractors/http";
import { readTraceFromSNSEvent } from "./extractors/sns";
import { readTraceFromSNSSQSEvent } from "./extractors/sns-sqs";
import { readTraceFromEBSQSEvent } from "./extractors/event-bridge-sqs";
import { readTraceFromAppSyncEvent } from "./extractors/app-sync";
import { readTraceFromSQSEvent } from "./extractors/sqs";
import { readTraceFromKinesisEvent } from "./extractors/kinesis";
import { readTraceFromEventbridgeEvent } from "./extractors/event-bridge";
import {
  isAppSyncResolverEvent,
  isEBSQSEvent,
  isEventBridgeEvent,
  isKinesisStreamEvent,
  isSNSEvent,
  isSNSSQSEvent,
  isSQSEvent,
} from "../../utils/event-type-guards";
import { readTraceFromLambdaContext } from "./extractors/lambda-context";
import { readStepFunctionContextFromEvent } from "../step-function-service";
import { addStepFunctionContextToXray, addTraceContextToXray, readTraceContextFromXray } from "../xray-service";
import { readTraceFromStepFunctionsContext } from "./extractors/step-function";

export enum SampleMode {
  USER_REJECT = -1,
  AUTO_REJECT = 0,
  AUTO_KEEP = 1,
  USER_KEEP = 2,
}
export enum Source {
  Xray = "xray",
  Event = "event",
  DDTrace = "ddtrace",
}

export interface TraceContext {
  traceID: string;
  parentID: string;
  sampleMode: SampleMode;
  source: Source;
}

export const traceIDHeader = "x-datadog-trace-id";
export const parentIDHeader = "x-datadog-parent-id";
export const samplingPriorityHeader = "x-datadog-sampling-priority";

/**
 * Reads the trace context from either an incoming lambda event, or the current xray segment.
 * @param event An incoming lambda event. This must have incoming trace headers in order to be read.
 */
export async function extractTraceContext(
  event: any,
  context: Context,
  extractor?: TraceExtractor,
  decodeAuthorizerContext: boolean = true,
): Promise<TraceContext | undefined> {
  let trace;

  if (extractor) {
    try {
      trace = await extractor(event, context);
      logDebug(`extracted trace context from the custom extractor`, { trace });
    } catch (error) {
      if (error instanceof Error) {
        logError("custom extractor function failed", error as Error);
      }
    }
  }

  if (!trace) {
    trace = readTraceFromEvent(event, decodeAuthorizerContext);
  }

  if (!trace) {
    trace = readTraceFromLambdaContext(context);
  }

  const stepFuncContext = readStepFunctionContextFromEvent(event);
  if (stepFuncContext) {
    try {
      addStepFunctionContextToXray(stepFuncContext);
    } catch (error) {
      if (error instanceof Error) {
        logError("couldn't add step function metadata to xray", error as Error);
      }
    }
    if (trace === undefined) {
      trace = readTraceFromStepFunctionsContext(stepFuncContext);
      if (trace !== undefined) {
        return trace;
      }
    }
  }

  if (trace !== undefined) {
    try {
      addTraceContextToXray(trace);
      logDebug(`added trace context to xray metadata`, { trace });
    } catch (error) {
      // This might fail if running in an environment where xray isn't set up, (like for local development).
      if (error instanceof Error) {
        logError("couldn't add trace context to xray metadata", error as Error);
      }
    }
    return trace;
  }
  return readTraceContextFromXray();
}

export function readTraceFromEvent(event: any, decodeAuthorizerContext: boolean = true): TraceContext | undefined {
  if (!event || typeof event !== "object") {
    return;
  }

  if (event.headers !== null && typeof event.headers === "object") {
    return readTraceFromHTTPEvent(event, decodeAuthorizerContext);
  }

  if (isSNSEvent(event)) {
    return readTraceFromSNSEvent(event);
  }

  if (isSNSSQSEvent(event)) {
    return readTraceFromSNSSQSEvent(event);
  }

  if (isEBSQSEvent(event)) {
    return readTraceFromEBSQSEvent(event);
  }

  if (isAppSyncResolverEvent(event)) {
    return readTraceFromAppSyncEvent(event);
  }

  if (isSQSEvent(event)) {
    return readTraceFromSQSEvent(event);
  }
  if (isKinesisStreamEvent(event)) {
    return readTraceFromKinesisEvent(event);
  }

  if (isEventBridgeEvent(event)) {
    return readTraceFromEventbridgeEvent(event);
  }

  return;
}

export function exportTraceData(traceData: any): TraceContext | undefined {
  const traceID = traceData[traceIDHeader];
  const parentID = traceData[parentIDHeader];
  const sampledHeader = traceData[samplingPriorityHeader];

  if (typeof traceID !== "string" || typeof parentID !== "string" || typeof sampledHeader !== "string") {
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
