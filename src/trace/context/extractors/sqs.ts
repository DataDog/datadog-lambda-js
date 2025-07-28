import { SQSEvent } from "aws-lambda";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { XrayService } from "../../xray-service";

export class SQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    let sourceARN = "";
    try {
      // First try to extract trace context from message attributes
      let headers = event?.Records?.[0]?.messageAttributes?._datadog?.stringValue;
      sourceARN = event.Records[0].eventSourceARN;

      if (!headers) {
        // Then try to get from binary value. This happens when SNS->SQS, but SNS has raw message delivery enabled.
        // In this case, SNS maps any messageAttributes to the SQS messageAttributes.
        // We can at least get trace context from SQS, but we won't be able to create the SNS inferred span.
        const encodedTraceContext = event?.Records?.[0]?.messageAttributes?._datadog?.binaryValue;
        if (encodedTraceContext) {
          headers = Buffer.from(encodedTraceContext, "base64").toString("ascii");
        }
      }

      if (headers !== undefined) {
        this.tracerWrapper.setConsumeCheckpoint(JSON.parse(headers), "sqs", sourceARN, false);
        const traceContext = this.tracerWrapper.extract(JSON.parse(headers));
        if (traceContext) {
          logDebug("Extracted trace context from SQS event messageAttributes");
          return traceContext;
        } else {
          logDebug("Failed to extract trace context from messageAttributes");
        }
      }
      // Then try to extract trace context from attributes.AWSTraceHeader. (Upstream Java apps can
      // pass down Datadog trace context in the attributes.AWSTraceHeader in SQS case)
      if (event?.Records?.[0]?.attributes?.AWSTraceHeader !== undefined) {
        const traceContext = XrayService.extraceDDContextFromAWSTraceHeader(event.Records[0].attributes.AWSTraceHeader);
        if (traceContext) {
          logDebug("Extracted trace context from SQS event attributes AWSTraceHeader");
          return traceContext;
        } else {
          logDebug("No Datadog trace context found from SQS event attributes AWSTraceHeader");
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from SQS event", error);
      }
    }

    // Still want to set a DSM checkpoint even if DSM context not propagated
    this.tracerWrapper.setConsumeCheckpoint(null, "sqs", sourceARN, false);
    return null;
  }
}
