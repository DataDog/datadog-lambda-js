import { HTTPEventTraceExtractor } from "./http";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";

export class AppSyncEventTraceExtractor implements EventTraceExtractor {
  private httpEventExtractor: HTTPEventTraceExtractor;

  constructor(private tracerWrapper: TracerWrapper) {
    this.httpEventExtractor = new HTTPEventTraceExtractor(this.tracerWrapper, false);
  }

  extract(event: any): SpanContextWrapper | null {
    event.headers = event.request.headers;

    return this.httpEventExtractor.extract(event);
  }
}
