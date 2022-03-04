import {
  Context,
  DynamoDBStreamEvent,
  EventBridgeEvent,
  KinesisStreamEvent,
  S3CreateEvent,
  SNSEvent,
  SNSMessage,
  SQSEvent,
} from "aws-lambda";
import { SpanContext, SpanOptions, TracerWrapper } from "./tracer-wrapper";
import { eventSources, parseEventSource } from "./trigger";
import { SpanWrapper } from "./span-wrapper";
export class SpanInferrer {
  traceWrapper: TracerWrapper;
  constructor(traceWrapper: TracerWrapper) {
    this.traceWrapper = traceWrapper;
  }

  public createInferredSpan(event: any, context: Context | undefined, parentSpanContext: SpanContext | undefined): any {
    const eventSource = parseEventSource(event);
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
    if (eventSource === eventSources.s3) {
      return this.createInferredSpanForS3(event, context, parentSpanContext);
    }
    if (eventSource === eventSources.eventBridge) {
      return this.createInferredSpanForEventBridge(event, context, parentSpanContext);
    }
  }

  isApiGatewayAsync(event: any): boolean {
    return (
      event.headers && event.headers["X-Amz-Invocation-Type"] && event.headers["X-Amz-Invocation-Type"] === "Event"
    );
  }

  createInferredSpanForApiGateway(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const domain = event.requestContext.domainName;
    const path = event.rawPath || event.requestContext.path || event.requestContext.routeKey;
    const resourcePath = event.rawPath || event.requestContext.resourcePath || event.requestContext.routeKey;

    let method;
    if (event.requestContext.httpMethod) {
      method = event.requestContext.httpMethod;
    } else if (event.requestContext.http) {
      method = event.requestContext.http.method;
    }
    const resourceName = [method || domain, resourcePath].join(" ");
    options.tags = {
      operation_name: "aws.apigateway",
      "http.url": domain + path,
      endpoint: path,
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "http",
      "resource.name": resourceName,
      "service.name": domain,
      apiid: event.requestContext.apiId,
      service: domain,
      _inferred_span: {
        tag_source: "self",
        synchronicity: this.isApiGatewayAsync(event),
      },
    };
    // Set APIGW v1 or v1 metadata
    if (method) {
      options.tags["http.method"] = method;
      options.tags.stage = event.requestContext.stage;
      options.tags.domain_name = domain;
    }
    // Set websocket metadata
    if (event.requestContext.messageDirection) {
      options.tags.message_direction = event.requestContext.messageDirection;
      options.tags.connection_id = event.requestContext.connectionId;
      options.tags.event_type = event.requestContext.eventType;
    }
    if (parentSpanContext) {
      options.childOf = parentSpanContext;
    }
    options.startTime = event.requestContext.timeEpoch;
    const spanWrapperOptions = {
      isAsync: this.isApiGatewayAsync(event),
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.apigateway", options), spanWrapperOptions);
  }

  createInferredSpanForDynamoDBStreamEvent(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const { Records } = event as DynamoDBStreamEvent;
    const referenceRecord = Records[0];
    const { eventSourceARN, eventName, eventVersion, eventID, dynamodb } = referenceRecord;
    const [tableArn, tableName] = eventSourceARN?.split("/") || [undefined, undefined];
    const resourceName = `${eventName} ${tableName}`;
    options.tags = {
      operation_name: "aws.dynamodb",
      tablename: tableName,
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": resourceName,
      service: "aws.dynamodb",
      _inferred_span: {
        tag_source: "self",
        synchronicity: "async",
      },
      event_name: eventName,
      event_version: eventVersion,
      event_source_arn: eventSourceARN,
      event_id: eventID,
    };
    if (dynamodb) {
      options.tags.stream_view_type = dynamodb.StreamViewType;
      options.tags.size_bytes = dynamodb.SizeBytes;
    }
    if (parentSpanContext) {
      options.childOf = parentSpanContext;
    }
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
      EventSubscriptionArn,
      Sns: { TopicArn, Timestamp, Type, Subject, MessageId },
    } = referenceRecord;
    const topicName = TopicArn?.split(":").pop();
    const resourceName = topicName;
    options.tags = {
      operation_name: "aws.sns",
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "sns",
      "resource.name": resourceName,
      service: "sns",
      _inferred_span: {
        tag_source: "self",
        synchronicity: "async",
      },
      type: Type,
      subject: Subject,
      message_id: MessageId,
      topicname: topicName,
      topic_arn: TopicArn,
      event_subscription_arn: EventSubscriptionArn,
    };
    if (parentSpanContext) {
      options.childOf = parentSpanContext;
    }
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
    const { TopicArn, Timestamp, Type, Subject, MessageId } = event;
    const topicName = TopicArn?.split(":").pop();
    const resourceName = topicName;
    options.tags = {
      operation_name: "aws.sns",
      resource_names: resourceName,
      "span.type": "sns",
      "resource.name": resourceName,
      service: "sns",
      _inferred_span: {
        tag_source: "self",
        synchronicity: "async",
      },
      type: Type,
      subject: Subject,
      message_id: MessageId,
      topicname: topicName,
      topic_arn: TopicArn,
    };
    if (parentSpanContext) {
      options.childOf = parentSpanContext;
    }
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
      attributes: { SentTimestamp, ApproximateReceiveCount, SenderId },
      eventSourceARN,
      receiptHandle,
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
      queuename: queueName,
      event_source_arn: eventSourceARN,
      receipt_handle: receiptHandle,
      sender_id: SenderId,
    };
    if (ApproximateReceiveCount && Number(ApproximateReceiveCount) > 0) {
      options.tags.retry_count = Number(ApproximateReceiveCount);
    }
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
      kinesis: { approximateArrivalTimestamp, partitionKey },
      eventSourceARN,
      eventName,
      eventVersion,
      eventID,
    } = referenceRecord;
    const streamName = eventSourceARN?.split(":").pop();
    const shardId = eventID.split(":").pop();
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
      streamname: streamName,
      event_id: eventID,
      event_name: eventName,
      event_source_arn: eventSourceARN,
      event_version: eventVersion,
      partition_key: partitionKey,
      shardid: shardId,
    };
    if (parentSpanContext) {
      options.childOf = parentSpanContext;
    }
    options.startTime = Number(approximateArrivalTimestamp) * 1000;
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
        bucket: { name: bucketName, arn },
        object: { key, size, eTag },
      },
      eventTime,
      eventName,
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
      bucketname: bucketName,
      bucket_arn: arn,
      event_name: eventName,
      object_key: key,
      object_size: size,
      object_etag: eTag,
    };
    if (parentSpanContext) {
      options.childOf = parentSpanContext;
    }
    options.startTime = Date.parse(eventTime);
    const spanWrapperOptions = {
      isAsync: true,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.s3", options), spanWrapperOptions);
  }

  createInferredSpanForEventBridge(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const { time, source } = event as EventBridgeEvent<any, any>;
    options.tags = {
      operation_name: "aws.eventbridge",
      resource_names: source,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": source,
      service: "eventbridge",
      _inferred_span: {
        tag_source: "self",
        synchronicity: "async",
      },
    };
    if (parentSpanContext) {
      options.childOf = parentSpanContext;
    }
    options.startTime = Date.parse(time);
    const spanWrapperOptions = {
      isAsync: true,
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.eventbridge", options), spanWrapperOptions);
  }
}
