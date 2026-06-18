import { SQSEvent, SQSRecord } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, handleExtractionError } from "../extractor-utils";
import { TraceConfig } from "../../listener";

export class EventBridgeSQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    // Set DSM consume checkpoints if enabled and capture first record's headers.
    // EventBridge -> SQS follows the SQS DSM conventions (type:sqs, topic:queue ARN),
    // since the event is delivered to and consumed from the SQS queue.
    let firstRecordHeaders: Record<string, string> | null = null;
    if (this.config.dataStreamsEnabled) {
      for (let i = 0; i < (event?.Records || []).length; i++) {
        const record = event.Records[i];
        try {
          const headers = this.getParsedRecordHeaders(record);

          // Store first record's headers for trace context extraction
          if (i === 0) {
            firstRecordHeaders = headers;
          }

          // Set a checkpoint for the record, even if we don't have headers
          this.tracerWrapper.setConsumeCheckpoint(headers, "sqs", record.eventSourceARN);
        } catch (error) {
          handleExtractionError(error, "EventBridge-SQS DSM checkpoint");
        }
      }
    }

    try {
      // Use already parsed headers from DSM if available, otherwise parse now
      if (!firstRecordHeaders) {
        firstRecordHeaders = this.getParsedRecordHeaders(event?.Records?.[0]);
      }

      if (firstRecordHeaders) {
        return extractTraceContext(firstRecordHeaders, this.tracerWrapper);
      }
    } catch (error) {
      handleExtractionError(error, "EventBridge-SQS");
    }

    return null;
  }

  private getParsedRecordHeaders(record: SQSRecord | undefined): Record<string, string> | null {
    if (!record) {
      return null;
    }
    try {
      const body = record.body;
      if (body) {
        const parsedBody = JSON.parse(body);
        return parsedBody?.detail?._datadog ?? null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}
