import { TraceContext } from "../extractor";
import { readTraceFromHTTPEvent } from "./http";

export function readTraceFromAppSyncEvent(event: any): TraceContext | undefined {
  event.headers = event.request.headers;
  return readTraceFromHTTPEvent(event, false);
}
