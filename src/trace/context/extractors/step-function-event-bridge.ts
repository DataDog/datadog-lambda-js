import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { EventBridgeEvent } from "aws-lambda";
import { StepFunctionContextService } from "../../step-function-service";


export class StepFunctionEventBridgeTraceExtractor implements EventTraceExtractor {
  extract(event: EventBridgeEvent<any, any>): SpanContextWrapper | null {
    // The Step Function context is wrapped in the EventBridge event detail
    // Use StepFunctionContextService to extract the trace context
    const instance = StepFunctionContextService.instance(event?.detail);
    const context = instance.context;

    if (context === undefined) return null;

    return instance.spanContext;
  }
}
