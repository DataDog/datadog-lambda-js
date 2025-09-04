import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, handleExtractionError } from "../extractor-utils";
import { TraceConfig } from "trace/listener";

export class EventBridgeSQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: SQSEvent): SpanContextWrapper[] {
    const spanContexts: SpanContextWrapper[] = [];
    try {
      for (const record of event.Records) {
        const body = record?.body;
        if (body) {
          const parsedBody = JSON.parse(body);
          const headers = parsedBody?.detail?._datadog;
          if (headers) {
            spanContexts.push(...extractTraceContext(headers, this.tracerWrapper));
          }
        }

        // If span links is disabled only extract from the first record.
        if (!this.config.useSpanLinks) {
          break;
        }
      }
    } catch (error) {
      handleExtractionError(error, "EventBridge-SQS");
    }

    return spanContexts;
  }
}
