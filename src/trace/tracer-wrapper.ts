import { TraceHeaders } from "./trace-context-service";

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
  tracer: any;

  constructor() {
    try {
      this.tracer = require("dd-trace");
    } catch {}
  }

  get isTracerAvailable(): boolean {
    return this.tracer !== undefined && this.tracer._tracer !== undefined && "_service" in this.tracer._tracer;
  }

  extract(event: Partial<TraceHeaders>): SpanContext | null {
    if (!this.isTracerAvailable) {
      return null;
    }
    return this.tracer.extract("http_headers", event) as SpanContext | null;
  }

  wrap<T = (...args: any[]) => any>(name: string, options: TraceOptions, fn: T) {
    if (!this.isTracerAvailable) {
      return fn;
    }
    return this.tracer.wrap(name, options, fn);
  }
}
