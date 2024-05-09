import { SNSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { XrayService, AMZN_TRACE_ID_ENV_VAR } from "../../xray-service";

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

        const traceContext = this.tracerWrapper.extract(headers);
        if (traceContext) {
          logDebug("Extracted trace context from SNS event", { traceContext, event });
          return traceContext;
        } else {
          logDebug("Failed to extract trace context from SNS event", { event });
        }
      }
      // Then try to extract trace context from _X_AMZN_TRACE_ID header (Upstream Java apps can
      // pass down Datadog trace id (parent id wrong) in the env in SNS case)
      if (process.env[AMZN_TRACE_ID_ENV_VAR]) {
        const traceContext = XrayService.extraceDDContextFromAWSTraceHeader(process.env[AMZN_TRACE_ID_ENV_VAR]);
        if (traceContext) {
          logDebug("Extracted Datadog trace context from _X_AMZN_TRACE_ID");
          return traceContext;
        } else {
          logDebug("No Datadog trace context found from _X_AMZN_TRACE_ID");
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from SNS event", error);
      }
    }

    return null;
  }
}
