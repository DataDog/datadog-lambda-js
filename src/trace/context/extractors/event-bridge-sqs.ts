import { EventBridgeEvent, SQSEvent } from "aws-lambda";
import { EventTraceExtractor } from "../extractor";
import { logDebug } from "../../../utils";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { StepFunctionContextService } from "../../step-function-service";

export class EventBridgeSQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    const body = event?.Records?.[0]?.body;
    if (body === undefined) return null;

    try {
      const parsedBody = JSON.parse(body) as EventBridgeEvent<any, any>;
      const headers = parsedBody?.detail?._datadog;
      if (headers === undefined) return null;

      // First try to extract as regular trace headers
      const traceContext = this.tracerWrapper.extract(headers);
      if (traceContext !== null) {
        logDebug("Extracted trace context from EventBridge-SQS event", { traceContext, event });
        return traceContext;
      }

      // If that fails, check if this is a Step Function context
      // The StepFunctionContextService can handle the Step Function format
      const stepFunctionInstance = StepFunctionContextService.instance(headers);
      const stepFunctionContext = stepFunctionInstance.context;

      if (stepFunctionContext !== undefined) {
        const spanContext = stepFunctionInstance.spanContext;
        if (spanContext !== null) {
          logDebug("Extracted Step Function trace context from EventBridge-SQS event", { spanContext, event });
          return spanContext;
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from EventBridge-SQS event", error);
      }
    }

    return null;
  }
}
