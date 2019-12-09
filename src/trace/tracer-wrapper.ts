import { logDebug } from "../utils";
import { TraceHeaders } from "./trace-context-service";
import { TraceContext } from "./context";
import { SampleMode, Source } from "./constants";

export interface SpanContext {
  toTraceId(): string;
  toSpanId(): string;
}

export interface TraceOptions {
  resource?: string;
  service?: string;
  type?: string;
  tags?: { [key: string]: any };
  childOf?: SpanContext;
}

// TraceWrapper is used to remove dd-trace as a hard dependency from the npm package.
// This lets a customer bring their own version of the tracer.
export class TracerWrapper {
  private tracer: any;

  constructor() {
    try {
      // Try and use the same version of the tracing library the user has installed.
      // This handles edge cases where two versions of dd-trace are installed, one in the layer
      // and one in the user's code.
      const path = require.resolve("dd-trace", { paths: ["/var/task/node_modules", ...module.paths ] });
      this.tracer = require(path);
      return;
    } catch {
      logDebug(`Couldn't require dd-trace from main`);
    }
  }

  public get isTracerAvailable(): boolean {
    return this.tracer !== undefined && this.tracer._tracer !== undefined && "_service" in this.tracer._tracer;
  }

  public extract(event: Partial<TraceHeaders>): SpanContext | null {
    if (!this.isTracerAvailable) {
      return null;
    }
    return this.tracer.extract("http_headers", event) as SpanContext | null;
  }

  public wrap<T = (...args: any[]) => any>(name: string, options: TraceOptions, fn: T) {
    if (!this.isTracerAvailable) {
      return fn;
    } 
    return this.tracer.wrap(name, options, fn);
  }

  public traceContext(): TraceContext | undefined {
    if (!this.isTracerAvailable) {
      return;
    }
    const scope = this.tracer.scope();
    const span = scope.active();
    if (span === null) {
      return;
    }
    const parentID = span.context().toSpanId();
    const traceID = span.context().toTraceId();
    return {
      parentID,
      traceID,
      sampleMode: SampleMode.AUTO_KEEP,
      source: Source.Event
    };
  }
}
