import { getSegment } from "aws-xray-sdk-core";

import { convertToAPMParentID, TraceContext } from "./context";

export class TraceContextService {
  public rootTraceContext?: TraceContext;

  get currentTraceContext(): TraceContext | undefined {
    if (this.rootTraceContext === undefined) {
      return;
    }
    const traceContext = { ...this.rootTraceContext };
    const segment = getSegment();
    if (segment !== undefined) {
      const value = convertToAPMParentID(segment.parentId);
      if (value !== undefined) {
        traceContext.parentID = value;
      }
    }

    return traceContext;
  }
}
