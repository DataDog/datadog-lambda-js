import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, extractFromAWSTraceHeader, handleExtractionError } from "../extractor-utils";

export class SNSSQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    logDebug("SNS-SQS Extractor Being Used");
    try {
      // Try to extract trace context from SNS wrapped in SQS
      const body = event?.Records?.[0]?.body;
      if (body) {
        const parsedBody = JSON.parse(body);
        const snsMessageAttribute = parsedBody?.MessageAttributes?._datadog;
        if (snsMessageAttribute?.Value) {
          let headers;
          if (snsMessageAttribute.Type === "String") {
            headers = JSON.parse(snsMessageAttribute.Value);
          } else {
            // Try decoding base64 values
            const decodedValue = Buffer.from(snsMessageAttribute.Value, "base64").toString("ascii");
            headers = JSON.parse(decodedValue);
          }

          const traceContext = extractTraceContext(headers, this.tracerWrapper);
          if (traceContext) {
            return traceContext;
          }
          logDebug("Failed to extract trace context from SNS-SQS event");
        }
      }

      // Check SQS message attributes as a fallback
      const sqsMessageAttribute = event?.Records?.[0]?.messageAttributes?._datadog;
      if (sqsMessageAttribute?.stringValue) {
        const headers = JSON.parse(sqsMessageAttribute.stringValue);
        const traceContext = extractTraceContext(headers, this.tracerWrapper);
        if (traceContext) {
          return traceContext;
        }
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
}
