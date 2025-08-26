import { SQSEvent, SQSRecord } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, extractFromAWSTraceHeader, handleExtractionError } from "../extractor-utils";
import { TraceConfig } from "../../listener";

export class SNSSQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    // Set DSM consume checkpoints if enabled and capture first record's headers
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
          handleExtractionError(error, "SQS DSM checkpoint");
        }
      }
    }

    logDebug("SNS-SQS Extractor Being Used");
    try {
      // Use already parsed headers from DSM if available, otherwise parse now
      if (!firstRecordHeaders) {
        firstRecordHeaders = this.getParsedRecordHeaders(event?.Records?.[0]);
      }

      if (firstRecordHeaders) {
        const traceContext = extractTraceContext(firstRecordHeaders, this.tracerWrapper);
        if (traceContext) {
          return traceContext;
        }
        logDebug("Failed to extract trace context from SNS-SQS event");
      }

      // Else try to extract trace context from attributes.AWSTraceHeader
      // (Upstream Java apps can pass down Datadog trace context in the attributes.AWSTraceHeader in SQS case)
      const awsTraceHeader = event?.Records?.[0]?.attributes?.AWSTraceHeader;
      if (awsTraceHeader !== undefined) {
        return extractFromAWSTraceHeader(awsTraceHeader, "SNS-SQS");
      }
    } catch (error) {
      handleExtractionError(error, "SQS");
    }

    return null;
  }

  private getParsedRecordHeaders(record: SQSRecord | undefined): Record<string, string> | null {
    if (!record) {
      return null;
    }
    try {
      // Try to extract trace context from SNS wrapped in SQS
      const body = record.body;
      if (body) {
        const parsedBody = JSON.parse(body);
        const snsMessageAttribute = parsedBody?.MessageAttributes?._datadog;
        if (snsMessageAttribute?.Value) {
          if (snsMessageAttribute.Type === "String") {
            return JSON.parse(snsMessageAttribute.Value);
          } else {
            // Try decoding base64 values
            const decodedValue = Buffer.from(snsMessageAttribute.Value, "base64").toString("ascii");
            return JSON.parse(decodedValue);
          }
        }
      }

      // Check SQS message attributes as a fallback
      const sqsMessageAttribute = record.messageAttributes?._datadog;
      if (sqsMessageAttribute?.stringValue) {
        return JSON.parse(sqsMessageAttribute.stringValue);
      }

      return null;
    } catch (error) {
      return null;
    }
  }
}
