import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { EventBridgeEvent } from "aws-lambda";
import { StepFunctionContextService } from "../../step-function-service";
import { logDebug } from "../../../utils";


export class StepFunctionEventBridgeTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: EventBridgeEvent<any, any>): SpanContextWrapper | null {
    try {
      // The Step Function context is wrapped in the EventBridge event detail
      const stepFunctionContext = event?.detail?._datadog;

      if (!stepFunctionContext) {
        logDebug("No _datadog field found in EventBridge event detail");
        return null;
      }

      // Use StepFunctionContextService to extract the trace context
      const instance = StepFunctionContextService.instance(stepFunctionContext);
      const context = instance.context;

      if (context === undefined) {
        logDebug("Failed to extract Step Function context from EventBridge event");
        return null;
      }

      const spanContext = instance.spanContext;

      if (!spanContext) {
        logDebug("Failed to generate span context from Step Function EventBridge event");
        return null;
      }

      logDebug("Extracted trace context from Step Function EventBridge event");
      return spanContext;
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from Step Function EventBridge event", error);
      }
      return null;
    }
  }
}
