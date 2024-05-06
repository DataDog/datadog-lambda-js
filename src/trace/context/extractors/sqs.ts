import { SQSEvent } from "aws-lambda";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { XrayService } from "../../xray-service";

export class SQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    try {
      // First try to extract trace context from message attributes
      const headers = event?.Records?.[0]?.messageAttributes?._datadog?.stringValue;
      if (headers !== undefined) {
        const traceContext = this.tracerWrapper.extract(JSON.parse(headers));
        if (traceContext) {
          logDebug("Extracted trace context from SQS event messageAttributes", { traceContext, event });
          return traceContext;
        } else {
          logDebug("Failed to extract trace context from messageAttributes", { event });
        }
      }
      // Then try to extract trace context from attributes.AWSTraceHeader. (Upstream Java apps can
      // pass down Datadog trace context in the attributes.AWSTraceHeader in SQS case)
      if (event?.Records?.[0]?.attributes?.AWSTraceHeader !== undefined) {
        const traceContext = XrayService.extraceDDContextFromAWSTraceHeader(event.Records[0].attributes.AWSTraceHeader);
        if (traceContext) {
          logDebug("Extracted trace context from SQS event attributes AWSTraceHeader", { traceContext, event });
          return traceContext;
        } else {
          logDebug("No Datadog trace context found from SQS event attributes AWSTraceHeader", { event });
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from SQS event", error);
      }
    }

    return null;
  }
}
