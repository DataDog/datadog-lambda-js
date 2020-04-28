import { getSegment, getLogger, setLogger, Logger, Segment } from "aws-xray-sdk-core";

import { logDebug, logError } from "../utils";
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
    const datadogContext = this.tracerWrapper.traceContext();
    if (datadogContext) {
      logDebug(`set trace context from dd-trace with parent ${datadogContext.parentID}`);
      return datadogContext;
    }

    const xraySegment = this.getXraySegment();
    if (xraySegment === undefined) {
      logError("couldn't retrieve segment from xray");
    } else {
      const value = convertToAPMParentID(xraySegment.id);
      if (value !== undefined) {
        logDebug(`set trace context from xray with parent ${value} from segment`);
        traceContext.parentID = value;
      }
    }

    return traceContext;
  }

  get currentTraceHeaders(): Partial<TraceHeaders> {
    if (this.currentTraceContext === undefined) {
      return {};
    }
    return {
      [traceIDHeader]: this.currentTraceContext.traceID,
      [parentIDHeader]: this.currentTraceContext.parentID,
      [samplingPriorityHeader]: this.currentTraceContext.sampleMode.toString(10),
    };
  }

  get traceSource() {
    return this.rootTraceContext !== undefined ? this.rootTraceContext.source : undefined;
  }

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
