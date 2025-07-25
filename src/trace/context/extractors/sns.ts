import { SNSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { AMZN_TRACE_ID_ENV_VAR } from "../../xray-service";
import { extractTraceContext, extractFromAWSTraceHeader, handleExtractionError } from "../extractor-utils";

export class SNSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SNSEvent): SpanContextWrapper | null {
    try {
      // First try to extract trace context from message attributes
      const messageAttribute = event?.Records?.[0]?.Sns?.MessageAttributes?._datadog;
      if (messageAttribute?.Value) {
        let headers;
        if (messageAttribute.Type === "String") {
          headers = JSON.parse(messageAttribute.Value);
        } else {
          // Try decoding base64 values
          const decodedValue = Buffer.from(messageAttribute.Value, "base64").toString("ascii");
          headers = JSON.parse(decodedValue);
        }

        const traceContext = extractTraceContext(headers, this.tracerWrapper);
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
}
