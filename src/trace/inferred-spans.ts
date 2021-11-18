import { Context } from "aws-lambda";
import { SpanOptions, TracerWrapper } from "./tracer-wrapper";
import { eventSources, parseEventSource } from "./trigger";

export class SpanInferrer {
  traceWrapper: TracerWrapper;
  constructor(traceWrapper: TracerWrapper) {
    this.traceWrapper = traceWrapper;
  }

  public createInferredSpan(event: any, context: Context | undefined): any {
    const eventSource = parseEventSource(event);
    if (eventSource === eventSources.lambdaUrl) {
      return this.createInferredSpanForLambdaUrl(event, context);
    }
  }

  createInferredSpanForLambdaUrl(event: any, context: Context | undefined): any {
    const options: SpanOptions = {};
    const domain = event.requestContext.domainName;
    const path = event.rawPath;
    options.tags = {
      operation_name: "aws.lambda.url",
      "http.url": domain + path,
      endpoint: path,
      "http.method": event.requestContext.http.method,
      resource_name: domain + path,
      request_id: context?.awsRequestId,
    };
    options.type = "serverless";
    options.service = "aws.lambda";
    const request_time_epoch = event.requestContext.timeEpoch;
    options.startTime = request_time_epoch;

    let span = this.traceWrapper.startSpan("aws.lambda.url", options);
    return span;
  }
}
