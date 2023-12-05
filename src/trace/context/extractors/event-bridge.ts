import { EventTraceExtractor } from "../extractor";
import { EventBridgeEvent } from "aws-lambda";
import { logDebug } from "../../../utils";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";

export class EventBridgeEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: EventBridgeEvent<any, any>): SpanContextWrapper | null {
    const headers = event?.detail?._datadog;
    if (headers === undefined) return null;

    try {
      const traceContext = this.tracerWrapper.extract(headers);
      if (traceContext === null) return null;

      logDebug(`Extracted trace context from Eventbridge event`, { traceContext, event });
      return traceContext;
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from EventBridge event", error);
      }
    }

    return null;
  }
}
