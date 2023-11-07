import { logDebug } from "../utils";
import { TraceContext, TraceSource } from "./trace-context-service";
import { SpanContext } from "./tracer-wrapper";

/**
 * SpanContextWrapper is a proxy class for DatadogSpanContext
 * defined in `dd-trace-js`.
 */
export class SpanContextWrapper implements SpanContext {
  constructor(public spanContext: any, public source: TraceSource) {}

  public toSpanId(): string {
    return this.spanContext.toSpanId();
  }

  public toTraceId(): string {
    return this.spanContext.toTraceId();
  }

  public sampleMode(): number {
    return this.spanContext._sampling?.priority;
  }

  public static fromTraceContext(traceContext: TraceContext): SpanContextWrapper | null {
    try {
      const traceId = traceContext.traceId || traceContext.traceID;
      const spanId = traceContext.parentId || traceContext.parentID;
      if (traceId === undefined) {
        logDebug(`Unable to extract traceId`, { traceContext });
        return null;
      }

      if (spanId === undefined) {
        logDebug(`Unable to extract spanId`, { traceContext });
        return null;
      }

      // Try requiring class from the tracer.
      const _DatadogSpanContext = require("dd-trace/packages/dd-trace/src/opentracing/span_context");

      return new SpanContextWrapper(
        new _DatadogSpanContext({
          traceId,
          spanId,
          sampling: { priority: traceContext.sampleMode.toString(10) },
        }),
        traceContext.source,
      );
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Couldn't require dd-trace from main", error);
      }
      return null;
    }
  }
}
