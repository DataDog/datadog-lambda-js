import { getEnvValue } from "../index";
import { logDebug } from "../utils";
import { SpanContextWrapper } from "./span-context-wrapper";
import { TraceSource } from "./trace-context-service";

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

// TraceWrapper is used to remove dd-trace as a hard dependency from the npm package.
// This lets a customer bring their own version of the tracer.
export class TracerWrapper {
  private tracer: any;
  private dataStreamsCheckpointer: any;

  constructor() {
    try {
      // Try and use the same version of the tracing library the user has installed.
      // This handles edge cases where two versions of dd-trace are installed, one in the layer
      // and one in the user's code.
      const path = require.resolve("dd-trace", { paths: ["/var/task/node_modules", ...module.paths] });
      this.tracer = require(path);
      if (getEnvValue("DD_DATA_STREAMS_ENABLED", "false").toLowerCase() === "true") {
        console.log("DataStreamsCheckpointer initialization beginning");
        console.log("this.tracer._tracer", this.tracer._tracer);
        console.log("this.tracer._tracer._dataStreamsProcessor", this.tracer._tracer._dataStreamsProcessor);
        const DataStreamsCheckpointer =
          require("dd-trace/packages/dd-trace/src/datastreams/checkpointer").DataStreamsCheckpointer;
        this.dataStreamsCheckpointer = new DataStreamsCheckpointer(this.tracer._tracer);
      }
      return;
    } catch (err) {
      if (err instanceof Object || err instanceof Error) {
        logDebug("Couldn't require dd-trace from main", err);
      }
    }
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

  public extract(event: any): SpanContextWrapper | null {
    if (!this.isTracerAvailable) {
      return null;
    }

    const extractedSpanContext = this.tracer.extract("text_map", event);
    if (!extractedSpanContext) return null;

    const spanContext = new SpanContextWrapper(extractedSpanContext, TraceSource.Event);

    return spanContext;
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

  public traceContext(): SpanContextWrapper | null {
    if (!this.isTracerAvailable) {
      return null;
    }
    const span = this.currentSpan;
    if (span === null) {
      return null;
    }

    return new SpanContextWrapper(span.context(), TraceSource.DdTrace);
  }

  public injectSpan(span: SpanContext): any {
    const dest = {};
    this.tracer.inject(span, "text_map", dest);
    return dest;
  }

  public setConsumeCheckpoint(context_json: any, event_type: string, arn: string): any {
    if (!arn) {
      return;
    }

    try {
      this.dataStreamsCheckpointer.setConsumeCheckpoint(event_type, arn, context_json);
    } catch (error) {
      logDebug(
        `DSM: Failed to set consume checkpoint for ${event_type} ${arn}:`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
