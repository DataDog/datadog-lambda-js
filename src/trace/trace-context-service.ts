import { getSegment, getLogger, setLogger, Logger, Segment } from "aws-xray-sdk-core";

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
const noopXrayLogger: Logger = {
  warn: (message: string) => {},
  debug: (message: string) => {},
  info: (message: string) => {},
  error: (message: string) => {},
};

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

    // Update the parent id to the active X-Ray subsegment if available
    const xraySegment = this.getXraySegment();
    if (xraySegment === undefined) {
      logDebug("couldn't retrieve segment from xray");
    } else {
      const value = convertToAPMParentID(xraySegment.id);
      if (value !== undefined) {
        logDebug(`set trace context from xray with parent ${value} from segment`, { xraySegment });
        traceContext.parentID = value;
      }
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

  // Get the current X-Ray (sub)segment. Note, this always return a
  // (sub)segment even if when X-Ray active tracing is not enabled.
  private getXraySegment(): Segment | undefined {
    // Newer versions of X-Ray core sdk will either throw
    // an exception or log a noisy output message when segment is empty.
    // We temporarily disabled logging on the library as a work around.
    const oldLogger = getLogger();
    let xraySegment: Segment | undefined;
    try {
      setLogger(noopXrayLogger);
      xraySegment = getSegment();
    } catch (error) {}
    setLogger(oldLogger);
    return xraySegment;
  }
}
