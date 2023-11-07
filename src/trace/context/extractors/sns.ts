import { SNSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { SpanContextWrapper } from "../../span-context-wrapper";

export class SNSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SNSEvent): SpanContextWrapper | null {
    const messageAttribute = event?.Records?.[0]?.Sns?.MessageAttributes?._datadog;
    if (messageAttribute?.Value === undefined) return null;

    try {
      let headers;
      if (messageAttribute.Type === "String") {
        headers = JSON.parse(messageAttribute.Value);
      } else {
        // Try decoding base64 values
        const decodedValue = Buffer.from(messageAttribute.Value, "base64").toString("ascii");
        headers = JSON.parse(decodedValue);
      }

      const traceContext = this.tracerWrapper.extract(headers);
      if (traceContext === null) return null;

      logDebug(`Extracted trace context from SNS event`, { traceContext, event });
      return traceContext;
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from SNS event", error);
      }
    }

    return null;
  }
}
