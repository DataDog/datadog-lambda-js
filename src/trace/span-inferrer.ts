import { Context } from "aws-lambda";
import { SpanOptions, TracerWrapper } from "./tracer-wrapper";
import { eventSources, parseEventSource } from "./trigger";
import { SpanWrapper, SpanWrapperOptions } from "./span-wrapper";

export class SpanInferrer {
  traceWrapper: TracerWrapper;
  constructor(traceWrapper: TracerWrapper) {
    this.traceWrapper = traceWrapper;
  }

  // [astuyve] TODO does this belong here?
  // We'd probably want to create a coldstart span
  // even if we can't create an inferred span
  public createColdStartSpan(
    inferredSpan: SpanWrapper,
    lambdaSpan: SpanWrapper,
    resourceName: string | undefined,
  ): void {
    const options: SpanOptions = {
      tags: {
        operation_name: "aws.lambda.cold_start",
        "span.type": "serverless",
        "resource.name": resourceName || "aws.lambda.cold_start",
      },
      service: "aws.lambda",
      startTime: inferredSpan.startTime(),
    };
    options.childOf = inferredSpan.span;
    const coldStartSpan = this.traceWrapper.startSpan("aws.lambda.cold_start", options) as any;
    coldStartSpan.finish(lambdaSpan.endTime());
  }

  public createInferredSpan(event: any, context: Context | undefined): any {
    const eventSource = parseEventSource(event);
    if (eventSource === eventSources.lambdaUrl) {
      return this.createInferredSpanForLambdaUrl(event, context);
    }
    if (eventSource === eventSources.apiGateway) {
      return this.createInferredSpanForApiGateway(event, context);
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
      resource_names: domain + path,
      request_id: context?.awsRequestId,
      "span.type": "http",
      "resource.name": domain + path,
    };
    options.service = "aws.lambda";
    options.startTime = event.requestContext.timeEpoch;
    const spanWrapperOptions = {
      isAsync: false,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.lambda.url", options), spanWrapperOptions);
  }

  createInferredSpanForApiGateway(event: any, context: Context | undefined): any {
    const options: SpanOptions = {};
    const domain = event.requestContext.domainName;
    const path = event.rawPath;
    options.tags = {
      operation_name: "aws.api_gateway",
      "http.url": domain + path,
      endpoint: path,
      "http.method": event.requestContext.http.method,
      resource_names: domain + path,
      request_id: context?.awsRequestId,
      "span.type": "http",
      "resource.name": domain + path,
    };
    options.service = "aws.lambda";
    options.startTime = event.requestContext.timeEpoch;
    const spanWrapperOptions = {
      isAsync: false,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.api_gateway", options), spanWrapperOptions);
  }
}
