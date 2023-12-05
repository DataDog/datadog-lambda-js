import { Context } from "aws-lambda";
import { TraceExtractor, TraceSource } from "../../trace-context-service";
import { logDebug, logError } from "../../../utils";
import { SpanContextWrapper } from "../../span-context-wrapper";

export class CustomTraceExtractor {
  constructor(private customExtractor: TraceExtractor) {}

  async extract(event: any, context: Context): Promise<SpanContextWrapper | null> {
    try {
      const traceContext = await this.customExtractor(event, context);
      const spanContext = SpanContextWrapper.fromTraceContext(traceContext);
      if (spanContext === null) return null;

      logDebug(`Extracted trace context from Custom Extractor`, { traceContext });
      return spanContext;
    } catch (error) {
      if (error instanceof Error) {
        logError("Unable to extract trace context. Custom extractor function failed", error);
      }
    }

    return null;
  }
}
