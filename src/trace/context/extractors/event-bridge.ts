import { EventTraceExtractor } from "../extractor";
import { EventBridgeEvent } from "aws-lambda";
import { logDebug } from "../../../utils";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { StepFunctionContextService } from "../../step-function-service";

export class EventBridgeEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: EventBridgeEvent<any, any>): SpanContextWrapper | null {
    const headers = event?.detail?._datadog;
    if (headers === undefined) return null;

    try {
      // First try to extract as regular trace headers
      const traceContext = this.tracerWrapper.extract(headers);
      if (traceContext !== null) {
        logDebug(`Extracted trace context from Eventbridge event`, { traceContext, event });
        return traceContext;
      }

      // If that fails, check if this is a Step Function context
      // The StepFunctionContextService can handle the Step Function format
      const stepFunctionInstance = StepFunctionContextService.instance(headers);
      const stepFunctionContext = stepFunctionInstance.context;

      if (stepFunctionContext !== undefined) {
        const spanContext = stepFunctionInstance.spanContext;
        if (spanContext !== null) {
          logDebug(`Extracted Step Function trace context from Eventbridge event`, { spanContext, event });
          return spanContext;
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from EventBridge event", error);
      }
    }

    return null;
  }
}
