import { SpanContextWrapper } from "../../span-context-wrapper";
import { DurableFunctionContextService } from "../../durable-function-service";
import { EventTraceExtractor } from "../extractor";

export class DurableFunctionEventTraceExtractor implements EventTraceExtractor {
  extract(event: any): SpanContextWrapper | null {
    const durableFunctionInstance = DurableFunctionContextService.instance(event);
    const durableFunctionContext = durableFunctionInstance.context;

    if (durableFunctionContext !== undefined) {
      const spanContext = durableFunctionInstance.spanContext;
      if (spanContext !== null) {
        return spanContext;
      }
    }

    return null;
  }
}
