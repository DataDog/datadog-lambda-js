import { logDebug } from "../utils";
import { parentIDHeader, samplingPriorityHeader, traceIDHeader } from "./constants";
import { convertToAPMParentID, TraceContext } from "./context";
import { TracerWrapper } from "./tracer-wrapper";

/**
 * Headers that can be added to a request.
 */
export interface TraceHeaders {
  [traceIDHeader]: string;
  [parentIDHeader]: string;
  [samplingPriorityHeader]: string;
}

/**
 * Service for retrieving the latest version of the request context from xray.
 */
export class TraceContextService {
  public rootTraceContext?: TraceContext;

  constructor(private tracerWrapper: TracerWrapper) {}

  get currentTraceContext(): TraceContext | undefined {
    if (this.rootTraceContext === undefined) {
      return;
    }
    const traceContext = { ...this.rootTraceContext };

    // Update the parent id to the active datadog span if available
    const datadogContext = this.tracerWrapper.traceContext();
    if (datadogContext) {
      logDebug(`set trace context from dd-trace with parent ${datadogContext.parentID}`);
      return datadogContext;
    }

    return traceContext;
  }

  // Get the current trace headers to be propagated to the downstream calls,
  // The parent id always points to the current active span.
  get currentTraceHeaders(): Partial<TraceHeaders> {
    const traceContext = this.currentTraceContext;
    if (traceContext === undefined) {
      return {};
    }
    return {
      [traceIDHeader]: traceContext.traceID,
      [parentIDHeader]: traceContext.parentID,
      [samplingPriorityHeader]: traceContext.sampleMode.toString(10),
    };
  }

  // Get the trace headers from the root trace context.
  get rootTraceHeaders(): Partial<TraceHeaders> {
    const rootTraceContext = this.rootTraceContext;
    if (rootTraceContext === undefined) {
      return {};
    }
    return {
      [traceIDHeader]: rootTraceContext.traceID,
      [parentIDHeader]: rootTraceContext.parentID,
      [samplingPriorityHeader]: rootTraceContext.sampleMode.toString(10),
    };
  }

  get traceSource() {
    return this.rootTraceContext !== undefined ? this.rootTraceContext.source : undefined;
  }
}
