import { logDebug } from "../utils";
import { SampleMode, Source } from "./constants";
import { TraceContext } from "./context";
import { TraceHeaders } from "./trace-context-service";
import { Tracer } from "dd-trace";

export interface SpanContext {
  toTraceId(): string;
  toSpanId(): string;
}

export interface SpanOptions {
  childOf?: SpanContext;
  tags?: { [key: string]: any };
  startTime?: number;
  service?: string;
  type?: string;
}

export interface TraceOptions {
  resource?: string;
  service?: string;
  type?: string;
  tags?: { [key: string]: any };
  childOf?: SpanContext;
}

export function initTracer(tracer: Tracer): Tracer {
  tracer.init({
    tags: {
      "_dd.origin": "lambda",
    },
  });
  logDebug("automatically initialized dd-trace");

  // Configure the tracer to ignore HTTP calls made from the Lambda Library to the Extension
  tracer.use("http", {
    blocklist: /:8124\/lambda/,
  });
  return tracer;
}

// TraceWrapper is used to remove dd-trace as a hard dependency from the npm package.
// This lets a customer bring their own version of the tracer.
export class TracerWrapper {
  private readonly tracer: any;

  constructor(tracer: Tracer) {
    this.tracer = tracer;
  }

  public get isTracerAvailable(): boolean {
    return this.tracer !== undefined && this.tracer._tracer !== undefined && "_service" in this.tracer._tracer;
  }

  public get currentSpan(): any | null {
    if (!this.isTracerAvailable) {
      return null;
    }
    return this.tracer.scope().active();
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

  public startSpan<T = (...args: any[]) => any>(name: string, options: TraceOptions): T | null {
    if (!this.isTracerAvailable) {
      return null;
    }
    return this.tracer.startSpan(name, options);
  }

  public traceContext(): TraceContext | undefined {
    if (!this.isTracerAvailable) {
      return;
    }
    const span = this.currentSpan;
    if (span === null) {
      return;
    }
    const parentID = span.context().toSpanId();
    const traceID = span.context().toTraceId();
    return {
      parentID,
      sampleMode: SampleMode.AUTO_KEEP,
      source: Source.Event,
      traceID,
    };
  }

  public injectSpan(span: SpanContext): any {
    const dest = {};
    this.tracer.inject(span, "text_map", dest);
    return dest;
  }
}
