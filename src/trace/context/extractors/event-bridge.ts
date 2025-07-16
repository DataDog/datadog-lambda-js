import { EventBridgeEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, handleExtractionError } from "../extractor-utils";

export class EventBridgeEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: EventBridgeEvent<string, any>): SpanContextWrapper | null {
    try {
      const headers = event?.detail?._datadog;
      if (headers) {
        return extractTraceContext(headers, this.tracerWrapper);
      }
    } catch (error) {
      handleExtractionError(error, "EventBridge");
    }

    return null;
  }
}
