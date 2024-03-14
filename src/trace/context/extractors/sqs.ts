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
      var prepared_headers;
      const headers = event?.Records?.[0]?.messageAttributes?._datadog?.stringValue;
      if (headers !== undefined) {
        prepared_headers = JSON.parse(headers);
      } else {
        if (event?.Records?.[0]?.attributes?.AWSTraceHeader) {
          prepared_headers = XrayService.extraceDDContextFromAWSTraceHeader(event.Records[0].attributes.AWSTraceHeader);
        }
      }

      if (!prepared_headers) return null;
      const traceContext = this.tracerWrapper.extract(prepared_headers);
      if (traceContext === null) {
        logDebug("Unable to extract the injected trace context from event");
        return null;
      }
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
