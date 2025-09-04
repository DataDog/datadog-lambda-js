import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { extractTraceContext, extractFromAWSTraceHeader, handleExtractionError } from "../extractor-utils";
import { TraceConfig } from "trace/listener";

export class SQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: SQSEvent): SpanContextWrapper[] {
    logDebug("SQS Extractor Being Used");
    const spanContexts: SpanContextWrapper[] = [];
    try {
      for (const record of event.Records) {
        // First try to extract trace context from message attributes
        let headers = record?.messageAttributes?._datadog?.stringValue;

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
            spanContexts.push(...traceContext);
          }
          logDebug("Failed to extract trace context from SQS event");
        }

        // Else try to extract trace context from attributes.AWSTraceHeader
        // (Upstream Java apps can pass down Datadog trace context in the attributes.AWSTraceHeader in SQS case)
        const awsTraceHeader = event?.Records?.[0]?.attributes?.AWSTraceHeader;
        if (awsTraceHeader !== undefined) {
          spanContexts.push(...extractFromAWSTraceHeader(awsTraceHeader, "SQS"));
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
