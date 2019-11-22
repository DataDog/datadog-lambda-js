import { getSegment } from "aws-xray-sdk-core";

import { logDebug, logError } from "../utils";
import { parentIDHeader, samplingPriorityHeader, traceIDHeader } from "./constants";
import { convertToAPMParentID, TraceContext } from "./context";

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

  get currentTraceContext(): TraceContext | undefined {
    if (this.rootTraceContext === undefined) {
      return;
    }
    const traceContext = { ...this.rootTraceContext };
    try {
      const segment = getSegment();
      const value = convertToAPMParentID(segment.id);
      if (value !== undefined) {
        logDebug(`set trace context from xray with parent ${value} from segment`);
        traceContext.parentID = value;
      }
    } catch (error) {
      logError("couldn't retrieve segment from xray", { innerError: error });
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
}
