import { EventBridgeEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, handleExtractionError } from "../extractor-utils";
import { TraceConfig } from "../../listener";

export class EventBridgeEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: EventBridgeEvent<string, any>): SpanContextWrapper | null {
    const headers = event?.detail?._datadog;

    // Set DSM consume checkpoint if enabled. EventBridge DSM uses the event's
    // detail-type as the topic, matching the produce-side convention.
    if (this.config.dataStreamsEnabled) {
      try {
        this.tracerWrapper.setConsumeCheckpoint(headers, "eventbridge", event?.["detail-type"]);
      } catch (error) {
        handleExtractionError(error, "EventBridge DSM checkpoint");
      }
    }

    try {
      if (headers) {
        return extractTraceContext(headers, this.tracerWrapper);
      }
    } catch (error) {
      handleExtractionError(error, "EventBridge");
    }

    return null;
  }
}
