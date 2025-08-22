import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, extractFromAWSTraceHeader, handleExtractionError } from "../extractor-utils";
import { TraceConfig } from "../../listener";

export class SQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    // Set DSM consume checkpoints if enabled
    if (this.config.dataStreamsEnabled) {
      for (const record of event?.Records || []) {
        try {
          // First get the headers from the message attributes, which makes it easy to extract trace context
          let headers = record.messageAttributes?._datadog?.stringValue;
          if (!headers) {
            // Then try to get headers from binary value. This happens when SNS->SQS, but SNS has raw message delivery enabled.
            // In this case, SNS maps any messageAttributes to the SQS messageAttributes.
            // We can at least get trace context from SQS, but we won't be able to create the SNS inferred span.
            const encodedTraceContext = record.messageAttributes?._datadog?.binaryValue;
            if (encodedTraceContext) {
              headers = Buffer.from(encodedTraceContext, "base64").toString("ascii");
            }
          }

          headers = headers ? JSON.parse(headers) : null;

          // Set a checkpoint for the record, even if we don't have headers
          this.tracerWrapper.setConsumeCheckpoint(headers, "sqs", record.eventSourceARN);
        } catch (error) {
          handleExtractionError(error, "SQS DSM checkpoint");
        }
      }
    }

    logDebug("SQS Extractor Being Used");
    try {
      // First try to extract trace context from message attributes
      let headers = event?.Records?.[0]?.messageAttributes?._datadog?.stringValue;

      if (!headers) {
        // Then try to get from binary value. This happens when SNS->SQS, but SNS has raw message delivery enabled.
        // In this case, SNS maps any messageAttributes to the SQS messageAttributes.
        // We can at least get trace context from SQS, but we won't be able to create the SNS inferred span.
        const encodedTraceContext = event?.Records?.[0]?.messageAttributes?._datadog?.binaryValue;
        if (encodedTraceContext) {
          headers = Buffer.from(encodedTraceContext, "base64").toString("ascii");
        }
      }

      if (headers) {
        const parsedHeaders = JSON.parse(headers);

        const traceContext = extractTraceContext(parsedHeaders, this.tracerWrapper);
        if (traceContext) {
          return traceContext;
        }
        logDebug("Failed to extract trace context from SQS event");
      }

      // Else try to extract trace context from attributes.AWSTraceHeader
      // (Upstream Java apps can pass down Datadog trace context in the attributes.AWSTraceHeader in SQS case)
      const awsTraceHeader = event?.Records?.[0]?.attributes?.AWSTraceHeader;
      if (awsTraceHeader !== undefined) {
        return extractFromAWSTraceHeader(awsTraceHeader, "SQS");
      }
    } catch (error) {
      handleExtractionError(error, "SQS");
    }

    return null;
  }
}
