import { SNSMessage, SQSEvent } from "aws-lambda";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { SpanContextWrapper } from "../../span-context-wrapper";

export class SNSSQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    const body = event?.Records?.[0]?.body;
    if (body === undefined) return null;

    try {
      const parsedBody = JSON.parse(body) as SNSMessage;
      const messageAttribute = parsedBody?.MessageAttributes?._datadog;
      if (messageAttribute.Value === undefined) return null;

      let headers;
      if (messageAttribute.Type === "String") {
        headers = JSON.parse(messageAttribute.Value);
      } else {
        const decodedValue = Buffer.from(messageAttribute.Value, "base64").toString("ascii");
        headers = JSON.parse(decodedValue);
      }

      const traceContext = this.tracerWrapper.extract(headers);
      if (traceContext === null) return null;

      logDebug("Extracted trace context from SNS-SQS event", { traceContext, event });
      return traceContext;
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from SNS-SQS event", error);
      }
    }

    return null;
  }
}
