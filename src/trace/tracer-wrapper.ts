import { logDebug, logWarning } from "../utils";
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
  // Cached propagator that extracts only Datadog-style headers (`x-datadog-*`)
  // regardless of `DD_TRACE_PROPAGATION_STYLE_EXTRACT`. Built lazily on first
  // datadog-only extract because the underlying tracer config is mutated
  // during dd-trace init and only stable after the user's handler is invoked.
  private datadogOnlyPropagator: any | null | undefined;

  constructor() {
    try {
      // Try and use the same version of the tracing library the user has installed.
      // This handles edge cases where two versions of dd-trace are installed, one in the layer
      // and one in the user's code.
      const path = require.resolve("dd-trace", { paths: ["/var/task/node_modules", ...module.paths] });
      this.tracer = require(path);
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

  /**
   * Extract a span context from a header dict using **only** the Datadog
   * propagation style, ignoring `DD_TRACE_PROPAGATION_STYLE_EXTRACT`.
   *
   * Use this for carriers we know are written by Datadog code (e.g. the
   * `_datadog_{N}` trace-context checkpoints written by the
   * datadog-plugin-aws-durable-execution-sdk-js plugin). For carriers
   * originating from arbitrary upstream services, use `extract` instead so
   * the user's propagation-style configuration is honored.
   */
  public extractDatadogOnly(headers: any): SpanContextWrapper | null {
    if (!this.isTracerAvailable) {
      return null;
    }

    const propagator = this.getOrBuildDatadogOnlyPropagator();
    if (!propagator) {
      // Fallback: if we couldn't reach into dd-trace internals to build a
      // forced-datadog propagator, defer to the standard extract. This is
      // strictly less correct (honors user style) but better than dropping
      // the context entirely.
      return this.extract(headers);
    }

    try {
      const extractedSpanContext = propagator.extract(headers);
      if (!extractedSpanContext) return null;
      return new SpanContextWrapper(extractedSpanContext, TraceSource.Event);
    } catch (err) {
      if (err instanceof Object || err instanceof Error) {
        logDebug("Datadog-only extract failed", err);
      }
      return null;
    }
  }

  private getOrBuildDatadogOnlyPropagator(): any | null {
    if (this.datadogOnlyPropagator !== undefined) return this.datadogOnlyPropagator;
    this.datadogOnlyPropagator = null;
    try {
      const innerTracer = this.tracer?._tracer;
      const config = innerTracer?._config;
      const existing = innerTracer?._propagators?.text_map;
      if (!config || !existing) return null;
      // Shadow tracePropagationStyle.extract while inheriting every other
      // field (baggage limits, x-datadog-tags length cap, etc.).
      const shadow = Object.create(config);
      shadow.tracePropagationStyle = {
        ...config.tracePropagationStyle,
        extract: ["datadog"],
      };
      // Build a sibling TextMapPropagator via the live propagator's constructor
      // so we don't have to bind to a dd-trace internal module path.
      this.datadogOnlyPropagator = new existing.constructor(shadow);
    } catch (err) {
      if (err instanceof Object || err instanceof Error) {
        logDebug("Failed to build datadog-only propagator", err);
      }
    }
    return this.datadogOnlyPropagator;
  }

  public wrap<T = (...args: any[]) => any>(name: string, options: TraceOptions, fn: T) {
    if (!this.isTracerAvailable) {
      return fn;
    }
    return this.tracer.wrap(name, options, fn);
  }

  public startSpan<T = (...args: any[]) => any>(name: string, options: TraceOptions): T | null {
    if (!this.isTracerAvailable) {
      logDebug("No Tracer available, cannot start span");
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

  public closeScope(): void {
    try {
      const activeSpan = this.currentSpan;
      if (activeSpan && typeof activeSpan.finish === "function") {
        const context = activeSpan.context();
        const traceId = context?.toTraceId?.() ?? "unknown";
        const spanId = context?.toSpanId?.() ?? "unknown";
        logDebug(
          `Detected stale span from previous invocation, finishing it to prevent trace context leakage. TraceId: ${traceId}, SpanId: ${spanId}`,
        );
        activeSpan.finish();
      }
    } catch (err) {
      if (err instanceof Object || err instanceof Error) {
        logDebug("Failed to close dd-trace scope", err);
      }
    }
  }

  public injectSpan(span: SpanContext): any {
    const dest = {};
    this.tracer.inject(span, "text_map", dest);
    return dest;
  }

  public setConsumeCheckpoint(contextJson: any, eventType: string, arn: string): void {
    if (!arn) {
      logDebug("DSM: No ARN provided, skipping setConsumeCheckpoint");
      return;
    }

    try {
      this.tracer.dataStreamsCheckpointer.setConsumeCheckpoint(eventType, arn, contextJson, false);
    } catch (err) {
      if (err instanceof Object || err instanceof Error) {
        logDebug(`DSM: Failed to set consume checkpoint for ${eventType} ${arn}:`, err);
      }
    }
  }
}
