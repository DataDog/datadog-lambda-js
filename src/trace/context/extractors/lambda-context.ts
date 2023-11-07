import { logDebug } from "../../../utils";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";

interface ContextTraceExtractor {
  extract(context: any): SpanContextWrapper | null;
}

export class LambdaContextTraceExtractor implements ContextTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(context: any): SpanContextWrapper | null {
    if (!context || typeof context !== "object") return null;

    const custom = context.clientContext?.custom;
    if (!custom || typeof custom !== "object") return null;

    // TODO: Note of things to deprecate in next release, headers being just
    // custom field, instead of custom._datadog
    let headers = custom;
    if (headers._datadog !== undefined) {
      headers = headers._datadog;
    }

    const spanContext = this.tracerWrapper.extract(headers);
    if (spanContext === null) return null;

    logDebug("Extracted trace context from Lambda Context event", { spanContext, headers });
    return spanContext;
  }
}
