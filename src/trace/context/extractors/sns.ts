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
    let context: SpanContextWrapper | null = null;

    for (const record of event?.Records || []) {
      let headers = null;
      const sourceARN = record.Sns?.TopicArn;

      try {
        // First try to extract trace context from message attributes
        const messageAttribute = record.Sns?.MessageAttributes?._datadog;
        if (messageAttribute?.Value) {
          if (messageAttribute.Type === "String") {
            headers = JSON.parse(messageAttribute.Value);
          } else {
            // Try decoding base64 values
            const decodedValue = Buffer.from(messageAttribute.Value, "base64").toString("ascii");
            headers = JSON.parse(decodedValue);
          }
        }

        // Set a checkpoint for the record, even if we don't have headers
        this.tracerWrapper.setConsumeCheckpoint(headers, "sns", sourceARN);

        // If we've already extracted context, skip the rest of the extraction, since we only want to extract context once
        if (!context) {
          // Try to extract trace context from headers
          if (headers) {
            context = extractTraceContext(headers, this.tracerWrapper);
          } else {
            logDebug("Failed to extract trace context from SNS event");

            // Then try to extract trace context from _X_AMZN_TRACE_ID header (Upstream Java apps can
            // pass down Datadog trace id (parent id wrong) in the env in SNS case)
            if (process.env[AMZN_TRACE_ID_ENV_VAR]) {
              context = extractFromAWSTraceHeader(process.env[AMZN_TRACE_ID_ENV_VAR], "SNS");
            }
          }
        }
      } catch (error) {
        handleExtractionError(error, "SNS");
      }
    }

    return context;
  }
}
