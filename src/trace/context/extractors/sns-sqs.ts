import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, extractFromAWSTraceHeader, handleExtractionError } from "../extractor-utils";
import { getDataStreamsEnabled } from "../../../index";

export class SNSSQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    logDebug("SNS-SQS Extractor Being Used");

    let context: SpanContextWrapper | null = null;
    for (const record of event?.Records || []) {
      try {
        // If we already have a context and dsm is not enabled, we can break out of the loop early
        if (!getDataStreamsEnabled() && context) {
          break;
        }

        let headers = null;
        // Try to extract trace context from SNS wrapped in SQS
        const body = record.body;
        if (body) {
          const parsedBody = JSON.parse(body);
          const snsMessageAttribute = parsedBody?.MessageAttributes?._datadog;
          if (snsMessageAttribute?.Value) {
            if (snsMessageAttribute.Type === "String") {
              headers = JSON.parse(snsMessageAttribute.Value);
            } else {
              // Try decoding base64 values
              const decodedValue = Buffer.from(snsMessageAttribute.Value, "base64").toString("ascii");
              headers = JSON.parse(decodedValue);
            }
          }
        }

        // Check SQS message attributes as a fallback
        if (!headers) {
          const sqsMessageAttribute = record.messageAttributes?._datadog;
          if (sqsMessageAttribute?.stringValue) {
            headers = JSON.parse(sqsMessageAttribute.stringValue);
          }
        }

        // Set a checkpoint for the record, even if we don't have headers
        this.tracerWrapper.setConsumeCheckpoint(headers, "sqs", record.eventSourceARN);

        // if we already have a context, no need to extract again
        if (context) continue;

        // Try to extract trace context from headers
        if (headers) {
          context = extractTraceContext(headers, this.tracerWrapper);
        } else {
          logDebug("Failed to extract trace context from SNS-SQS event");

          // Else try to extract trace context from attributes.AWSTraceHeader
          // (Upstream Java apps can pass down Datadog trace context in the attributes.AWSTraceHeader in SQS case)
          const awsTraceHeader = record.attributes?.AWSTraceHeader;
          if (awsTraceHeader !== undefined) {
            context = extractFromAWSTraceHeader(awsTraceHeader, "SNS-SQS");
          }
        }
      } catch (error) {
        handleExtractionError(error, "SQS");
      }
    }

    return context;
  }
}
