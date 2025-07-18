import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, extractFromAWSTraceHeader, handleExtractionError } from "../extractor-utils";

export class SQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    logDebug("SQS Extractor Being Used")
    logDebug("Line 13 - event", { event });
    try {
      // First try to extract trace context from message attributes
      let headers = event?.Records?.[0]?.messageAttributes?._datadog?.stringValue;

      logDebug("Line 18 - headers", { headers });

      if (!headers) {
        // Then try to get from binary value. This happens when SNS->SQS, but SNS has raw message delivery enabled.
        // In this case, SNS maps any messageAttributes to the SQS messageAttributes.
        // We can at least get trace context from SQS, but we won't be able to create the SNS inferred span.
        const encodedTraceContext = event?.Records?.[0]?.messageAttributes?._datadog?.binaryValue;
        if (encodedTraceContext) {
          headers = Buffer.from(encodedTraceContext, "base64").toString("ascii");
        }
      }

      logDebug("Line 30 - headers", { headers });

      if (headers) {
        const parsedHeaders = JSON.parse(headers);

        logDebug("Line 35 - parsedHeaders", { parsedHeaders });

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
