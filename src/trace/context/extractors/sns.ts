import { SNSEvent, SNSEventRecord } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { AMZN_TRACE_ID_ENV_VAR } from "../../xray-service";
import { extractTraceContext, extractFromAWSTraceHeader, handleExtractionError } from "../extractor-utils";
import { TraceConfig } from "../../listener";

export class SNSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: SNSEvent): SpanContextWrapper | null {
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
          this.tracerWrapper.setConsumeCheckpoint(headers, "sns", record.Sns?.TopicArn);
        } catch (error) {
          handleExtractionError(error, "SNS DSM checkpoint");
        }
      }
    }

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
        logDebug("Failed to extract trace context from SNS event");
      }

      // Then try to extract trace context from _X_AMZN_TRACE_ID header (Upstream Java apps can
      // pass down Datadog trace id (parent id wrong) in the env in SNS case)
      if (process.env[AMZN_TRACE_ID_ENV_VAR]) {
        return extractFromAWSTraceHeader(process.env[AMZN_TRACE_ID_ENV_VAR], "SNS");
      }
    } catch (error) {
      handleExtractionError(error, "SNS");
    }

    return null;
  }

  private getParsedRecordHeaders(record: SNSEventRecord | undefined): Record<string, string> | null {
    if (!record) {
      return null;
    }
    try {
      // First try to extract trace context from message attributes
      const messageAttribute = record.Sns?.MessageAttributes?._datadog;
      if (messageAttribute?.Value) {
        if (messageAttribute.Type === "String") {
          return JSON.parse(messageAttribute.Value);
        } else {
          // Try decoding base64 values
          const decodedValue = Buffer.from(messageAttribute.Value, "base64").toString("ascii");
          return JSON.parse(decodedValue);
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }
}
