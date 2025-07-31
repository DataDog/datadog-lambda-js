import { logDebug } from "../../utils";
import { StepFunctionContextService } from "../step-function-service";
import { SpanContextWrapper } from "../span-context-wrapper";
import { TracerWrapper } from "../tracer-wrapper";
import { XrayService } from "../xray-service";

/**
 * Common utility functions for trace context extraction
 */

/**
 * Attempts to extract trace context from headers, falling back to Step Function context if needed
 * @param headers The headers object to extract from
 * @param tracerWrapper The tracer wrapper instance
 * @returns SpanContextWrapper or null
 */
export function extractTraceContext(headers: any, tracerWrapper: TracerWrapper): SpanContextWrapper | null {
  // First try to extract as regular trace headers
  const traceContext = tracerWrapper.extract(headers);
  if (traceContext) {
    return traceContext;
  }

  // If that fails, check if this is a Step Function context
  const stepFunctionInstance = StepFunctionContextService.instance(headers);

  if (stepFunctionInstance.context !== undefined) {
    if (stepFunctionInstance.spanContext !== null) {
      return stepFunctionInstance.spanContext;
    }
  }

  return null;
}

/**
 * Extracts trace context from AWS Trace Header
 * @param awsTraceHeader The AWS trace header string
 * @param eventType The type of event (for logging)
 * @returns SpanContextWrapper or null
 */
export function extractFromAWSTraceHeader(awsTraceHeader: string, eventType: string): SpanContextWrapper | null {
  const traceContext = XrayService.extraceDDContextFromAWSTraceHeader(awsTraceHeader);
  if (traceContext) {
    logDebug(`Extracted trace context from ${eventType} event attributes AWSTraceHeader`);
    return traceContext;
  } else {
    logDebug(`No Datadog trace context found from ${eventType} event attributes AWSTraceHeader`);
    return null;
  }
}

/**
 * Common error handler for extraction operations
 * @param error The error that occurred
 * @param eventType The type of event (for logging)
 */
export function handleExtractionError(error: unknown, eventType: string): void {
  if (error instanceof Error) {
    logDebug(`Unable to extract trace context from ${eventType} event`, error);
  }
}
