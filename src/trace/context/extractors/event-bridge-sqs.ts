import { EventBridgeEvent, SQSEvent } from "aws-lambda";
import { EventTraceExtractor } from "../extractor";
import { logDebug } from "../../../utils";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";

export class EventBridgeSQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    const body = event?.Records?.[0]?.body;
    if (body === undefined) return null;

    try {
      const parsedBody = JSON.parse(body) as EventBridgeEvent<any, any>;
      const headers = parsedBody?.detail?._datadog;
      if (headers === undefined) return null;

      const traceContext = this.tracerWrapper.extract(headers);
      if (traceContext === null) return null;

      logDebug("Extracted trace context from EventBridge-SQS event", { traceContext, event });
      return traceContext;
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from EventBridge-SQS event", error);
      }
    }

    return null;
  }
}
