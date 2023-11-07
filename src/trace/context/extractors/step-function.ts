import { SpanContextWrapper } from "trace/span-context-wrapper";
import { StepFunctionContextService } from "../../step-function-service";
import { EventTraceExtractor } from "../extractor";

// TODO: Revisit refactor
export class StepFunctionEventTraceExtractor implements EventTraceExtractor {
  extract(event: any): SpanContextWrapper | null {
    // Probably StepFunctionContextService hasn't been called
    const instance = StepFunctionContextService.instance(event);
    const context = instance.context;

    if (context === undefined) return null;

    return instance.spanContext;
  }
}
