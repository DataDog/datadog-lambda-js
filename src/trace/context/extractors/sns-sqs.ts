import { SNSMessage, SQSEvent } from "aws-lambda";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { logDebug } from "../../../utils";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { XrayService } from "../../xray-service";
import { StepFunctionContextService } from "../../step-function-service";

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

          // First try to extract as regular trace headers
          const traceContext = this.tracerWrapper.extract(headers);
          if (traceContext) {
            logDebug("Extracted trace context from SNS-SQS event");
            return traceContext;
          }

          // If that fails, check if this is a Step Function context
          const stepFunctionInstance = StepFunctionContextService.instance(headers);
          const stepFunctionContext = stepFunctionInstance.context;

          if (stepFunctionContext !== undefined) {
            const spanContext = stepFunctionInstance.spanContext;
            if (spanContext !== null) {
              logDebug("Extracted Step Function trace context from SNS-SQS event", { spanContext, event });
              return spanContext;
            }
          }

          logDebug("Failed to extract trace context from SNS-SQS event");
        }
      }

      // Check SQS message attributes for Step Function context
      const sqsMessageAttribute = event?.Records?.[0]?.messageAttributes?._datadog?.stringValue;
      if (sqsMessageAttribute) {
        const parsedHeaders = JSON.parse(sqsMessageAttribute);

        // First try to extract as regular trace headers
        const traceContext = this.tracerWrapper.extract(parsedHeaders);
        if (traceContext) {
          logDebug("Extracted trace context from SQS messageAttributes");
          return traceContext;
        }

        // If that fails, check if this is a Step Function context
        const stepFunctionInstance = StepFunctionContextService.instance(parsedHeaders);
        const stepFunctionContext = stepFunctionInstance.context;

        if (stepFunctionContext !== undefined) {
          const spanContext = stepFunctionInstance.spanContext;
          if (spanContext !== null) {
            logDebug("Extracted Step Function trace context from SQS messageAttributes", { spanContext, event });
            return spanContext;
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
