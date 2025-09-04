import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, extractFromAWSTraceHeader, handleExtractionError } from "../extractor-utils";
import { TraceConfig } from "trace/listener";

export class SNSSQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: SQSEvent): SpanContextWrapper[] {
    logDebug("SNS-SQS Extractor Being Used");
    const spanContexts: SpanContextWrapper[] = [];
    try {
      for (const record of event.Records) {
        // Try to extract trace context from SNS wrapped in SQS
        const body = record?.body;
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
              spanContexts.push(...traceContext);
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
            spanContexts.push(...traceContext);
          }
        }

        // Else try to extract trace context from attributes.AWSTraceHeader
        // (Upstream Java apps can pass down Datadog trace context in the attributes.AWSTraceHeader in SQS case)
        const awsTraceHeader = event?.Records?.[0]?.attributes?.AWSTraceHeader;
        if (awsTraceHeader !== undefined) {
          spanContexts.push(...extractFromAWSTraceHeader(awsTraceHeader, "SNS-SQS"));
        }

        // If span links is disabled only extract from the first record.
        if (!this.config.useSpanLinks) {
          break;
        }
      }
    } catch (error) {
      handleExtractionError(error, "SQS");
    }

    return spanContexts;
  }
}
