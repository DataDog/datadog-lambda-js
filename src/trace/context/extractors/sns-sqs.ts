import { SNSMessage, SQSEvent } from "aws-lambda";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { XrayService } from "../../xray-service";

export class SNSSQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    try {
      // First try to extract trace context from message attributes
      if (event?.Records?.[0]?.body) {
        const parsedBody = JSON.parse(event?.Records?.[0]?.body) as SNSMessage;
        const messageAttribute = parsedBody?.MessageAttributes?._datadog;
        if (messageAttribute?.Value) {
          let headers;
          if (messageAttribute.Type === "String") {
            headers = JSON.parse(messageAttribute.Value);
          } else {
            const decodedValue = Buffer.from(messageAttribute.Value, "base64").toString("ascii");
            headers = JSON.parse(decodedValue);
          }

          const traceContext = this.tracerWrapper.extract(headers);
          if (traceContext) {
            logDebug("Extracted trace context from SNS-SQS event", { traceContext, event });
            return traceContext;
          } else {
            logDebug("Failed to extract trace context from SNS-SQS event", { event });
          }
        }
      }
      // Then try to extract trace context from attributes.AWSTraceHeader. (Upstream Java apps can
      // pass down Datadog trace context in the attributes.AWSTraceHeader in SQS case)
      if (event?.Records?.[0]?.attributes?.AWSTraceHeader !== undefined) {
        const traceContext = XrayService.extraceDDContextFromAWSTraceHeader(event.Records[0].attributes.AWSTraceHeader);
        if (traceContext) {
          logDebug("Extracted trace context from SNS-SQS event attributes.AWSTraceHeader");
          return traceContext;
        } else {
          logDebug("No Datadog trace context found from SNS-SQS event attributes.AWSTraceHeader");
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from SNS-SQS event", error);
      }
    }

    return null;
  }
}
