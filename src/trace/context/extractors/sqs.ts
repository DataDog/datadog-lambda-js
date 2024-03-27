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
      let parsedHeaders;
      const headers = event?.Records?.[0]?.messageAttributes?._datadog?.stringValue;
      if (headers !== undefined) {
        parsedHeaders = JSON.parse(headers);
      } else if (event?.Records?.[0]?.attributes?.AWSTraceHeader !== undefined) {
        parsedHeaders = XrayService.extraceDDContextFromAWSTraceHeader(event.Records[0].attributes.AWSTraceHeader);
      }
      if (!parsedHeaders) return null;

      const traceContext = this.tracerWrapper.extract(parsedHeaders);
      if (traceContext === null) {
        logDebug("Failed to extract trace context from parsed headers", { parsedHeaders, event });
        return null;
      }

      logDebug("Extracted trace context from SQS event", { traceContext, event });
      return traceContext;
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from SQS event", error);
      }
    }

    return null;
  }
}
