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
import { eventSubTypes, eventTypes, parseEventSource, parseEventSourceSubType } from "./trigger";
import { SpanWrapper } from "./span-wrapper";
import { parentSpanFinishTimeHeader } from "./constants";
import { logDebug } from "../utils";
import { getInjectedAuthorizerData } from "./context";
import { decodeAuthorizerContextEnvVar } from "../index";

export class SpanInferrer {
  traceWrapper: TracerWrapper;
  constructor(traceWrapper: TracerWrapper) {
    this.traceWrapper = traceWrapper;
  }

  public createInferredSpan(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
    decodeAuthorizerContext: boolean = true,
  ): any {
    const eventSource = parseEventSource(event);
    if (eventSource === eventTypes.lambdaUrl) {
      return this.createInferredSpanForLambdaUrl(event, context, parentSpanContext);
    }
    if (eventSource === eventTypes.apiGateway) {
      return this.createInferredSpanForApiGateway(event, context, parentSpanContext, decodeAuthorizerContext);
    }
    if (eventSource === eventTypes.sns) {
      return this.createInferredSpanForSns(event, context, parentSpanContext);
    }
    if (eventSource === eventTypes.dynamoDB) {
      return this.createInferredSpanForDynamoDBStreamEvent(event, context, parentSpanContext);
    }
    if (eventSource === eventTypes.sqs) {
      return this.createInferredSpanForSqs(event, context, parentSpanContext);
    }
    if (eventSource === eventTypes.kinesis) {
      return this.createInferredSpanForKinesis(event, context, parentSpanContext);
    }
    if (eventSource === eventTypes.s3) {
      return this.createInferredSpanForS3(event, context, parentSpanContext);
    }
    if (eventSource === eventTypes.eventBridge) {
      return this.createInferredSpanForEventBridge(event, context, parentSpanContext);
    }
  }

  isApiGatewayAsync(event: any): string {
    if (event.headers && event.headers["X-Amz-Invocation-Type"] && event.headers["X-Amz-Invocation-Type"] === "Event") {
      return "async";
    }
    return "sync";
  }

  static getServiceMapping(serviceName: string): string | undefined {
    const serviceMapping = process.env.DD_SERVICE_MAPPING || "";
    const mapping: Record<string, string> = {};

    serviceMapping.split(",").forEach((entry) => {
      const [key, value] = entry.split("|");
      if (key && value) {
        mapping[key.trim()] = value.trim();
      }
    });

    return mapping[serviceName];
  }

  createInferredSpanForApiGateway(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
    decodeAuthorizerContext: boolean = true,
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
    // Attempt to get the service mapping for the domain so that we don't remap all apigw services
    // Allows the customer to have more fine grained control
    const domainMapping = SpanInferrer.getServiceMapping(String(domain));

    // If the domain mapping is not found, attempt to get the service mapping for 'lambda_api_gateway'
    const apiGatewayMapping = domainMapping ? null : SpanInferrer.getServiceMapping("lambda_api_gateway");

    // If neither mapping is found, default to the domain name
    const serviceName = domainMapping || apiGatewayMapping || domain;

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
      service: serviceName,
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
    let upstreamAuthorizerSpan: SpanWrapper | undefined;
    const eventSourceSubType: eventSubTypes = parseEventSourceSubType(event);
    if (decodeAuthorizerContext) {
      try {
        const parsedUpstreamContext = getInjectedAuthorizerData(event, eventSourceSubType);
        if (parsedUpstreamContext) {
          let upstreamSpanOptions: SpanOptions = {};
          const startTime = parsedUpstreamContext[parentSpanFinishTimeHeader] / 1e6;
          // getting an approximated endTime
          if (eventSourceSubType === eventSubTypes.apiGatewayV2) {
            options.startTime = startTime; // not inserting authorizer span
            options.tags.operation_name = "aws.httpapi";
          } else {
            upstreamSpanOptions = {
              startTime,
              childOf: parentSpanContext,
              tags: { operation_name: "aws.apigateway.authorizer", ...options.tags },
            };
            upstreamAuthorizerSpan = new SpanWrapper(
              this.traceWrapper.startSpan("aws.apigateway.authorizer", upstreamSpanOptions),
              { isAsync: false },
            );
            const endTime = event.requestContext.requestTimeEpoch + event.requestContext.authorizer.integrationLatency;
            upstreamAuthorizerSpan.finish(endTime);
            options.startTime = endTime; // For the main function's inferred span
          }
        }
      } catch (error) {
        logDebug("Error decoding authorizer span", error as Error);
      }
    }

    if (!options.startTime) {
      if (
        eventSourceSubType === eventSubTypes.apiGatewayV1 ||
        eventSourceSubType === eventSubTypes.apiGatewayWebsocket
      ) {
        options.startTime = event.requestContext.requestTimeEpoch;
      } else {
        options.startTime = event.requestContext.timeEpoch;
      }
    }
    options.childOf = upstreamAuthorizerSpan ? upstreamAuthorizerSpan.span : parentSpanContext;

    const spanWrapperOptions = {
      isAsync: this.isApiGatewayAsync(event) === "async",
    };
    return new SpanWrapper(this.traceWrapper.startSpan("aws.apigateway", options), spanWrapperOptions);
  }

  createInferredSpanForLambdaUrl(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): any {
    const options: SpanOptions = {};
    const domain = event.requestContext.domainName;
    const path = event.rawPath;
    let method;
    if (event.requestContext.httpMethod) {
      method = event.requestContext.httpMethod;
    } else if (event.requestContext.http) {
      method = event.requestContext.http.method;
    }
    const resourceName = [method || domain, path].join(" ");
    // Attempt to get the service mapping for the domain so that we don't remap all apigw services
    // Allows the customer to have more fine grained control
    const domainMapping = SpanInferrer.getServiceMapping(String(domain));

    // If the domain mapping is not found, attempt to get the service mapping for 'lambda_url'
    const lambdUrlMapping = domainMapping ? null : SpanInferrer.getServiceMapping("lambda_url");

    // If neither mapping is found, default to the domain name
    const serviceName = domainMapping || lambdUrlMapping || domain;
    options.tags = {
      operation_name: "aws.lambda.url",
      "http.url": domain + path,
      endpoint: path,
      "http.method": event.requestContext.http.method,
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "http",
      "resource.name": resourceName,
      "service.name": domain,
      service: serviceName,
      _inferred_span: {
        tag_source: "self",
        synchronicity: "sync",
      },
    };
    options.startTime = event.requestContext.timeEpoch;
    const spanWrapperOptions = {
      isAsync: false,
    };
    if (parentSpanContext) {
      options.childOf = parentSpanContext;
    }
    return new SpanWrapper(this.traceWrapper.startSpan("aws.lambda.url", options), spanWrapperOptions);
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
    const [tableArnPrefix, tableName] = eventSourceARN?.split("/") || [undefined, undefined];
    let fullTableArn;
    if (tableArnPrefix && tableName) {
      fullTableArn = `${tableArnPrefix}/${tableName}`;
    }
    const resourceName = `${eventName} ${tableName}`;
    // Attempt to get the service mapping for the domain so that we don't remap all apigw services
    // Allows the customer to have more fine grained control
    const tableArnMapping = SpanInferrer.getServiceMapping(String(fullTableArn));

    // If the domain mapping is not found, attempt to get the service mapping for 'dynamodb'
    const dynamoDbMapping = tableArnMapping ? null : SpanInferrer.getServiceMapping("lambda_dynamodb");

    // If neither mapping is found, default to "aws.dynamodb"
    const serviceName = tableArnMapping || dynamoDbMapping || "aws.dynamodb";
    // const serviceName = SpanInferrer.getServiceMapping("dynamodb") || "aws.dynamodb";
    options.tags = {
      operation_name: "aws.dynamodb",
      tablename: tableName,
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": resourceName,
      service: serviceName,
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
    const topicMapping = SpanInferrer.getServiceMapping(String(TopicArn));
    // If the topic mapping is not found, attempt to get the service mapping for 'sns'
    const snsMapping = topicMapping ? null : SpanInferrer.getServiceMapping("lambda_sns");

    // If neither mapping is found, default to the sns name
    const serviceName = topicMapping || snsMapping || "sns";
    // const serviceName = SpanInferrer.getServiceMapping("sns") || "sns";
    options.tags = {
      operation_name: "aws.sns",
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "sns",
      "resource.name": resourceName,
      service: serviceName,
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
    // what is this aws.sns value in startSpan??
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
    const topicMapping = SpanInferrer.getServiceMapping(String(TopicArn));
    // If the domain mapping is not found, attempt to get the service mapping for 'sns'
    const snsMapping = topicMapping ? null : SpanInferrer.getServiceMapping("lambda_sns");

    // If neither mapping is found, default to the sns name
    const serviceName = topicMapping || snsMapping || "sns";
    // const serviceName = SpanInferrer.getServiceMapping("sns") || "sns";
    options.tags = {
      operation_name: "aws.sns",
      resource_names: resourceName,
      "span.type": "sns",
      "resource.name": resourceName,
      service: serviceName,
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
    const queueMapping = SpanInferrer.getServiceMapping(String(eventSourceARN));
    // If the domain mapping is not found, attempt to get the service mapping for 'sqs'
    const sqsMapping = queueMapping ? null : SpanInferrer.getServiceMapping("lambda_sqs");

    // If neither mapping is found, default to the sns name
    const serviceName = queueMapping || sqsMapping || "sqs";
    // const serviceName = SpanInferrer.getServiceMapping("sqs") || "sqs";

    options.tags = {
      operation_name: "aws.sqs",
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": resourceName,
      "service.name": resourceName,
      service: serviceName,
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
    const streamNameMapping = SpanInferrer.getServiceMapping(String(eventSourceARN));
    const kinesisMapping = streamNameMapping ? null : SpanInferrer.getServiceMapping("lambda_kinesis");

    // If neither mapping is found, default to the sns name
    const serviceName = streamNameMapping || kinesisMapping || "kinesis";
    // const serviceName = SpanInferrer.getServiceMapping("kinesis") || "kinesis";
    options.tags = {
      operation_name: "aws.kinesis",
      resource_names: streamName,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": streamName,
      service: serviceName,
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
    const bucketNameMapping = SpanInferrer.getServiceMapping(String(arn));
    // If the domain mapping is not found, attempt to get the service mapping for 's3'
    const s3Mapping = bucketNameMapping ? null : SpanInferrer.getServiceMapping("lambda_s3");

    // If neither mapping is found, default to the sns name
    const serviceName = bucketNameMapping || s3Mapping || "s3";
    // const serviceName = SpanInferrer.getServiceMapping("s3") || "s3";
    options.tags = {
      operation_name: "aws.s3",
      resource_names: bucketName,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": bucketName,
      service: serviceName,
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
    const sourceMapping = SpanInferrer.getServiceMapping(String(source));
    // If the domain mapping is not found, attempt to get the service mapping for 'eventbridge'
    const eventBridgeMapping = sourceMapping ? null : SpanInferrer.getServiceMapping("lambda_eventbridge");

    // If neither mapping is found, default to the eventbridge name
    const serviceName = sourceMapping || eventBridgeMapping || "eventbridge";
    // const serviceName = SpanInferrer.getServiceMapping("eventbridge") || "eventbridge";
    options.tags = {
      operation_name: "aws.eventbridge",
      resource_names: source,
      request_id: context?.awsRequestId,
      "span.type": "web",
      "resource.name": source,
      service: serviceName,
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
