import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, extractFromAWSTraceHeader, handleExtractionError } from "../extractor-utils";

export class SQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    try {
      // Try to extract trace context from message attributes
      const messageAttribute = event?.Records?.[0]?.messageAttributes?._datadog;
      if (messageAttribute) {
        let headers;
        if (messageAttribute.stringValue !== undefined) {
          headers = JSON.parse(messageAttribute.stringValue);
        } else if (messageAttribute.binaryValue !== undefined && messageAttribute.dataType === "Binary") {
          // Try decoding base64 values
          const decodedValue = Buffer.from(messageAttribute.binaryValue, "base64").toString("ascii");
          headers = JSON.parse(decodedValue);
        }

        if (headers) {
          const traceContext = extractTraceContext(headers, this.tracerWrapper);
          if (traceContext) {
            return traceContext;
          }
          logDebug("Failed to extract trace context from SQS event");
        }
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
