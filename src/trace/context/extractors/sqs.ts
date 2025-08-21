import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, extractFromAWSTraceHeader, handleExtractionError } from "../extractor-utils";
import { getDataStreamsEnabled } from "../../../index";

export class SQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    logDebug("SQS Extractor Being Used");

    let context: SpanContextWrapper | null = null;
    for (const record of event?.Records || []) {
      try {
        // If we already have a context and dsm is not enabled, we can break out of the loop early
        if (!getDataStreamsEnabled() && context) {
          break;
        }

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

        // if we already have a context, no need to extract again
        if (context) continue;
        // Try to extract trace context from headers
        if (headers) {
          context = extractTraceContext(headers, this.tracerWrapper);
        } else {
          logDebug("Failed to extract trace context from SQS event");

          // Try to extract trace context from attributes.AWSTraceHeader
          // (Upstream Java apps can pass down Datadog trace context in the attributes.AWSTraceHeader in SQS case)
          const awsTraceHeader = record.attributes?.AWSTraceHeader;
          if (awsTraceHeader !== undefined) {
            context = extractFromAWSTraceHeader(awsTraceHeader, "SQS");
          }
        }
      } catch (error) {
        handleExtractionError(error, "SQS");
      }
    }

    return context;
  }
}
