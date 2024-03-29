import { logDebug } from "../utils";
import { SampleMode, TraceContext, TraceSource } from "./trace-context-service";
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
    return this.spanContext._sampling?.priority ?? SampleMode.AUTO_KEEP;
  }

  public toString = (): string => {
    return {
      traceId: this.toTraceId(),
      parentId: this.toSpanId(),
      sampleMode: this.sampleMode().toString(),
    }.toString();
  };

  public static fromTraceContext(traceContext: TraceContext): SpanContextWrapper | null {
    const traceId = traceContext.traceId || traceContext.traceID;
    if (traceId === undefined) {
      logDebug(`Unable to extract traceId`, { traceContext });
      return null;
    }

    const spanId = traceContext.parentId || traceContext.parentID;
    if (spanId === undefined) {
      logDebug(`Unable to extract spanId`, { traceContext });
      return null;
    }

    const samplingPriority = traceContext.sampleMode.toString(10);
    const source = traceContext.source;
    try {
      // Try requiring class from the tracer.
      const _DatadogSpanContext = require("dd-trace/packages/dd-trace/src/opentracing/span_context");
      const id = require("dd-trace/packages/dd-trace/src/id");

      return new SpanContextWrapper(
        new _DatadogSpanContext({
          traceId: id(traceId, 10),
          spanId: id(spanId, 10),
          sampling: { priority: samplingPriority },
        }),
        source,
      );
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Couldn't generate SpanContext with tracer.", error);
      }
    }

    // No tracer is available, fallback to a mock class.
    // We can mock it, and it won't be parented since no
    // tracer is available, and we are conditionally checking on it.
    const _spanContext = {
      toSpanId: () => spanId,
      toTraceId: () => traceId,
      _sampling: {
        priority: samplingPriority,
      },
    };
    return new SpanContextWrapper(_spanContext, source);
  }
}
