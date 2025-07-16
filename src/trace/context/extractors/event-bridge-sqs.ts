import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, handleExtractionError } from "../extractor-utils";

export class EventBridgeSQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    try {
      const body = event?.Records?.[0]?.body;
      if (body) {
        const parsedBody = JSON.parse(body);
        const headers = parsedBody?.detail?._datadog;
        if (headers) {
          return extractTraceContext(headers, this.tracerWrapper);
        }
      }
    } catch (error) {
      handleExtractionError(error, "EventBridge-SQS");
    }

    return null;
  }
}
