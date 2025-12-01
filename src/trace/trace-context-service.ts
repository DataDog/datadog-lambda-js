import { Context } from "aws-lambda";
import {
  DATADOG_PARENT_ID_HEADER,
  DATADOG_SAMPLING_PRIORITY_HEADER,
  DATADOG_TRACE_ID_HEADER,
  TraceContextExtractor,
  DatadogTraceHeaders,
} from "./context/extractor";
import { TracerWrapper } from "./tracer-wrapper";
import { TraceConfig } from "./listener";
import { logDebug } from "../utils";
import { SpanContextWrapper } from "./span-context-wrapper";

export enum TraceSource {
  Xray = "xray",
  Event = "event",
  DdTrace = "ddtrace",
}

export enum SampleMode {
  USER_REJECT = -1,
  AUTO_REJECT = 0,
  AUTO_KEEP = 1,
  USER_KEEP = 2,
}

export interface TraceContext {
  /**
   * @deprecated use `traceId`
   */
  traceID?: string;
  /**
   * @deprecated use `parentId`
   */
  parentID?: string;
  traceId?: string;
  parentId?: string;
  sampleMode: SampleMode;
  source: TraceSource;
}

export type TraceExtractor = (event: any, context: Context) => Promise<TraceContext> | TraceContext;

export class TraceContextService {
  public rootTraceContext: SpanContextWrapper | null = null;
  private traceExtractor: TraceContextExtractor;

  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {
    this.traceExtractor = new TraceContextExtractor(this.tracerWrapper, this.config);
  }

  async extract(event: any, context: Context): Promise<SpanContextWrapper | null> {
    // Reset trace context and close dd-trace scope to prevent stale context from previous invocation due to unfinished spans
    this.rootTraceContext = null;
    this.tracerWrapper.closeScope();

    this.rootTraceContext = await this.traceExtractor?.extract(event, context);
    // Return the extracted context, not the current context which may not be related to the event or context
    return this.rootTraceContext;
  }

  get currentTraceHeaders(): Partial<DatadogTraceHeaders> {
    const traceContext = this.currentTraceContext as SpanContextWrapper;
    if (traceContext === null) return {};

    return {
      [DATADOG_TRACE_ID_HEADER]: traceContext.toTraceId(),
      [DATADOG_PARENT_ID_HEADER]: traceContext.toSpanId(),
      [DATADOG_SAMPLING_PRIORITY_HEADER]: traceContext.sampleMode().toString(),
    };
  }

  get currentTraceContext(): SpanContextWrapper | null {
    const traceContext = this.rootTraceContext;
    const currentDatadogContext = this.tracerWrapper.traceContext();
    if (currentDatadogContext) {
      logDebug(`set trace context from dd-trace with parent ${currentDatadogContext.toTraceId()}`);
      return currentDatadogContext;
    }

    return traceContext;
  }

  get traceSource() {
    return this.rootTraceContext !== null ? this.rootTraceContext?.source : null;
  }

  reset() {
    this.rootTraceContext = null;
  }
}
