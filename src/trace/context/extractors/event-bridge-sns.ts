import { EventBridgeEvent, SNSEvent } from "aws-lambda";
import { EventTraceExtractor } from "../extractor";
import { logDebug } from "../../../utils";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { StepFunctionContextService } from "../../step-function-service";

export class EventBridgeSNSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SNSEvent): SpanContextWrapper | null {
    const message = event?.Records?.[0]?.Sns?.Message;
    if (message === undefined) return null;

    try {
      const parsedMessage = JSON.parse(message) as EventBridgeEvent<any, any>;
      const headers = parsedMessage?.detail?._datadog;
      if (headers === undefined) return null;

      // First try to extract as regular trace headers
      const traceContext = this.tracerWrapper.extract(headers);
      if (traceContext !== null) {
        logDebug("Extracted trace context from EventBridge-SNS event", { traceContext, event });
        return traceContext;
      }

      // If that fails, check if this is a Step Function context
      // The StepFunctionContextService can handle the Step Function format
      const stepFunctionInstance = StepFunctionContextService.instance(headers);
      const stepFunctionContext = stepFunctionInstance.context;

      if (stepFunctionContext !== undefined) {
        const spanContext = stepFunctionInstance.spanContext;
        if (spanContext !== null) {
          logDebug("Extracted Step Function trace context from EventBridge-SNS event", { spanContext, event });
          return spanContext;
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from EventBridge-SNS event", error);
      }
    }

    return null;
  }
}