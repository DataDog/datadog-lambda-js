import { SQSEvent } from "aws-lambda";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { XrayService } from "../../xray-service";
import { StepFunctionContextService } from "../../step-function-service";

export class SQSEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: SQSEvent): SpanContextWrapper | null {
    try {
      // First try to extract trace context from message attributes
      let headers = event?.Records?.[0]?.messageAttributes?._datadog?.stringValue;

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
        const parsedHeaders = JSON.parse(headers);

        // First try to extract as regular trace headers
        const traceContext = this.tracerWrapper.extract(parsedHeaders);
        if (traceContext) {
          logDebug("Extracted trace context from SQS event messageAttributes");
          return traceContext;
        }

        // If that fails, check if this is a Step Function context
        const stepFunctionInstance = StepFunctionContextService.instance(parsedHeaders);
        const stepFunctionContext = stepFunctionInstance.context;

        if (stepFunctionContext !== undefined) {
          const spanContext = stepFunctionInstance.spanContext;
          if (spanContext !== null) {
            logDebug("Extracted Step Function trace context from SQS event", { spanContext, event });
            return spanContext;
          }
        }

        logDebug("Failed to extract trace context from messageAttributes");
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

    return null;
  }
}
