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
  public rootTraceContexts: SpanContextWrapper[] = [];
  private traceExtractor: TraceContextExtractor;

  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {
    this.traceExtractor = new TraceContextExtractor(this.tracerWrapper, this.config);
  }

  async extract(event: any, context: Context): Promise<SpanContextWrapper[]> {
    this.rootTraceContexts = await this.traceExtractor?.extract(event, context);

    return this.currentTraceContext;
  }

  get currentTraceHeaders(): Partial<DatadogTraceHeaders>[] {
    const traceContext = this.currentTraceContext;
    if (traceContext === null) return [{}];

    return traceContext.map((tc) => {
      return {
        [DATADOG_TRACE_ID_HEADER]: tc.toTraceId(),
        [DATADOG_PARENT_ID_HEADER]: tc.toSpanId(),
        [DATADOG_SAMPLING_PRIORITY_HEADER]: tc.sampleMode().toString(),
      };
    });
  }

  get currentTraceContext(): SpanContextWrapper[] {
    if (this.rootTraceContexts === null || this.rootTraceContexts.length === 0) return [];

    const traceContext = this.rootTraceContexts;
    const currentDatadogContext = this.tracerWrapper.traceContext();
    if (currentDatadogContext) {
      logDebug(`set trace context from dd-trace with parent ${currentDatadogContext.toTraceId()}`);
      return [currentDatadogContext];
    }

    return traceContext;
  }

  get traceSource() {
    return this.rootTraceContexts.length > 0 ? this.rootTraceContexts[0].source : null;
  }
}
