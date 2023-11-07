import { SQSEvent } from "aws-lambda";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { SpanContextWrapper } from "../../span-context-wrapper";

export class SQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    const headers = event?.Records?.[0]?.messageAttributes?._datadog?.stringValue;
    if (headers === undefined) return null;

    try {
      const traceContext = this.tracerWrapper.extract(JSON.parse(headers));
      if (traceContext === null) return null;

      logDebug(`Extracted trace context from SQS event`, { traceContext, event });
      return traceContext;
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from SQS event", error);
      }
    }

    return null;
  }
}
