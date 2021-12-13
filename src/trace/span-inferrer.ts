import {
  Context,
  DynamoDBStreamEvent,
  KinesisStreamEvent,
  S3CreateEvent,
  SNSEvent,
  SNSMessage,
  SQSEvent,
} from "aws-lambda";
import { SpanContext, SpanOptions, TracerWrapper } from "./tracer-wrapper";
import { eventSources, parseEventSource } from "./trigger";
import { SpanWrapper, SpanWrapperOptions } from "./span-wrapper";
import util from "util";
export class SpanInferrer {
  traceWrapper: TracerWrapper;
  constructor(traceWrapper: TracerWrapper) {
    this.traceWrapper = traceWrapper;
  }

  public createInferredSpan(event: any, context: Context | undefined, parentSpanContext: SpanContext | undefined): any {
    const eventSource = parseEventSource(event);
    console.log(`PARENT CONTEXT: ${util.inspect(parentSpanContext)}`);
    if (eventSource === eventSources.lambdaUrl) {
      return this.createInferredSpanForLambdaUrl(event, context, parentSpanContext);
    }
    if (eventSource === eventSources.apiGateway) {
      return this.createInferredSpanForApiGateway(event, context, parentSpanContext);
    }
    if (eventSource === eventSources.sns) {
      return this.createInferredSpanForSns(event, context, parentSpanContext);
    }
    if (eventSource === eventSources.dynamoDB) {
      return this.createInferredSpanForDynamoDBStreamEvent(event, context, parentSpanContext);
    }
    if (eventSource === eventSources.sqs) {
      return this.createInferredSpanForSqs(event, context, parentSpanContext);
    }
    if (eventSource === eventSources.kinesis) {
      return this.createInferredSpanForKinesis(event, context, parentSpanContext);
    }
  }

  createInferredSpanForLambdaUrl(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const domain = event.requestContext.domainName;
    const path = event.rawPath;
    const method = event.requestContext.http.method;
    const resourceName = [method, path].join(" ");
    options.tags = {
      operation_name: "aws.lambda.url",
      "http.url": domain + path,
      endpoint: path,
      "http.method": method,
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "http",
      "resource.name": resourceName,
      "service.name": domain,
      service: domain,
      _inferred_span: {
        tag_source: "self",
        synchronicity: "sync",
      },
    };
    options.childOf = parentSpanContext;
    options.startTime = event.requestContext.timeEpoch;
    const spanWrapperOptions = {
      isAsync: false,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.lambda.url", options), spanWrapperOptions);
  }

  createInferredSpanForApiGateway(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const domain = event.requestContext.domainName;
    const path = event.rawPath;
    const method = event.requestContext.http.method;
    const resourceName = [method, path].join(" ");
    options.tags = {
      operation_name: "aws.api_gateway",
      "http.url": domain + path,
      endpoint: path,
      "http.method": method,
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "http",
      "resource.name": resourceName,
      "service.name": domain,
      service: domain,
      _inferred_span: {
        tag_source: "self",
        synchronicity: "sync",
      },
    };
    options.childOf = parentSpanContext;
    options.startTime = event.requestContext.timeEpoch;
    const spanWrapperOptions = {
      isAsync: false,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.api_gateway", options), spanWrapperOptions);
  }

  createInferredSpanForDynamoDBStreamEvent(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const { Records } = event as DynamoDBStreamEvent;
    const referenceRecord = Records[0];
    const { eventSourceARN, eventName } = referenceRecord;
    const [tableArn, tableName] = eventSourceARN?.split("/") || [undefined, undefined];
    const resourceName = `${eventName} ${tableName}`;
    options.tags = {
      operation_name: "aws.dynamodb",
      "aws.dynamodb.table_name": tableName,
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": resourceName,
      service: "aws.dynamodb",
      _inferred_span: {
        tag_source: "self",
        synchronicity: "async",
      },
    };
    options.childOf = parentSpanContext;
    options.startTime = Number(referenceRecord.dynamodb?.ApproximateCreationDateTime) * 1000;
    const spanWrapperOptions = {
      isAsync: true,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.dynamodb", options), spanWrapperOptions);
  }

  createInferredSpanForSns(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const { Records } = event as SNSEvent;
    const referenceRecord = Records[0];
    const {
      Sns: { TopicArn, Timestamp },
    } = referenceRecord;
    const topicName = TopicArn?.split(":").pop();
    const resourceName = topicName;
    options.tags = {
      operation_name: "aws.sns",
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": resourceName,
      service: "sns",
      _inferred_span: {
        tag_source: "self",
        synchronicity: "async",
      },
    };
    options.childOf = parentSpanContext;
    options.startTime = Date.parse(Timestamp);
    const spanWrapperOptions = {
      isAsync: true,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.sns", options), spanWrapperOptions);
  }

  createInferredSpanForSqsSns(
    event: SNSMessage,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const { TopicArn, Timestamp } = event;
    const topicName = TopicArn?.split(":").pop();
    const resourceName = topicName;
    options.tags = {
      operation_name: "aws.sns",
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": resourceName,
      service: "sns",
      _inferred_span: {
        tag_source: "self",
        synchronicity: "async",
      },
    };
    options.childOf = parentSpanContext;
    options.startTime = Date.parse(Timestamp);
    const spanWrapperOptions = {
      isAsync: true,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.sns", options), spanWrapperOptions);
  }

  createInferredSpanForSqs(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const { Records } = event as SQSEvent;
    const referenceRecord = Records[0];
    const {
      attributes: { SentTimestamp },
      eventSourceARN,
      body,
    } = referenceRecord;
    const queueName = eventSourceARN?.split(":").pop();
    const resourceName = queueName;
    options.tags = {
      operation_name: "aws.sqs",
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": resourceName,
      "service.name": resourceName,
      service: "sqs",
      _inferred_span: {
        tag_source: "self",
        synchronicity: "async",
      },
    };
    // Check if sqs message was from sns
    // If so, unpack and look at timestamp
    // create further upstream sns span and finish/attach it here
    let upstreamSnsSpan: SpanWrapper | null = null;
    try {
      let upstreamSnsMessage: SNSMessage;
      upstreamSnsMessage = JSON.parse(body);
      if (upstreamSnsMessage && upstreamSnsMessage.TopicArn && upstreamSnsMessage.Timestamp) {
        upstreamSnsSpan = this.createInferredSpanForSqsSns(upstreamSnsMessage, context, parentSpanContext);
        upstreamSnsSpan.finish(Number(SentTimestamp));
      }
    } catch (e) {
      // Pass, it's a raw SQS message
    }
    options.childOf = upstreamSnsSpan ? upstreamSnsSpan.span : parentSpanContext;

    options.startTime = Number(SentTimestamp);

    const spanWrapperOptions = {
      isAsync: true,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.sqs", options), spanWrapperOptions);
  }

  createInferredSpanForKinesis(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const { Records } = event as KinesisStreamEvent;
    const referenceRecord = Records[0];
    const {
      kinesis: { approximateArrivalTimestamp },
      eventSourceARN,
    } = referenceRecord;
    const streamName = eventSourceARN?.split(":").pop();
    options.tags = {
      operation_name: "aws.kinesis",
      resource_names: streamName,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": streamName,
      service: "kinesis",
      _inferred_span: {
        tag_source: "self",
        synchronicity: "async",
      },
    };
    options.childOf = parentSpanContext;

    options.startTime = Number(approximateArrivalTimestamp);
    const spanWrapperOptions = {
      isAsync: true,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.kinesis", options), spanWrapperOptions);
  }

  createInferredSpanForS3(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const { Records } = event as S3CreateEvent;
    const referenceRecord = Records[0];
    const {
      s3: {
        bucket: { name: bucketName },
      },
      eventTime,
    } = referenceRecord;
    options.tags = {
      operation_name: "aws.s3",
      resource_names: bucketName,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": bucketName,
      service: "s3",
      _inferred_span: {
        tag_source: "self",
        synchronicity: "async",
      },
    };
    options.childOf = parentSpanContext;
    options.startTime = Date.parse(eventTime);
    const spanWrapperOptions = {
      isAsync: true,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.s3", options), spanWrapperOptions);
  }
}
