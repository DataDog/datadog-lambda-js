import { getSegment } from "aws-xray-sdk-core";

import { convertToAPMParentID, TraceContext } from "./context";

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
        traceContext.parentID = value;
      }
    } catch (error) {
      console.warn(JSON.stringify({ error: `datadog: couldn't retrieve segment from xray, ${error}` }));
    }

    return traceContext;
  }
}
