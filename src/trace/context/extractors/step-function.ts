import { SpanContextWrapper } from "../../span-context-wrapper";
import { StepFunctionContextService } from "../../step-function-service";
import { EventTraceExtractor } from "../extractor";

export class StepFunctionEventTraceExtractor implements EventTraceExtractor {
  extract(event: any): SpanContextWrapper[] {
    // Probably StepFunctionContextService hasn't been called
    const stepFunctionInstance = StepFunctionContextService.instance(event);
    const stepFunctionContext = stepFunctionInstance.context;

    if (stepFunctionContext !== undefined) {
      const spanContext = stepFunctionInstance.spanContext;
      if (spanContext !== null) {
        return [spanContext];
      }
    }

    return [];
  }
}
