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
import { eventTypes, parseEventSource } from "./trigger";
import { SpanWrapper } from "./span-wrapper";
import { DD_SERVICE_ENV_VAR, parentSpanFinishTimeHeader } from "./constants";
import { logDebug } from "../utils";
import { HTTPEventTraceExtractor } from "./context/extractors";
import { HTTPEventSubType } from "./context/extractors/http";

export class SpanInferrer {
  private static serviceMapping: Record<string, string> = {};
  traceWrapper: TracerWrapper;
  service?: string;
  constructor(traceWrapper: TracerWrapper) {
    this.traceWrapper = traceWrapper;
    this.service = process.env[DD_SERVICE_ENV_VAR];
    SpanInferrer.initServiceMapping();
  }

  private static initServiceMapping() {
    const serviceMappingStr = process.env.DD_SERVICE_MAPPING || "";

    serviceMappingStr.split(",").forEach((entry) => {
      const parts = entry.split(":").map((part) => part.trim());
      if (parts.length === 2 && parts[0] && parts[1] && parts[0] !== parts[1]) {
        this.serviceMapping[parts[0]] = parts[1];
      }
    });
  }

  static getServiceMapping(serviceName: string): string | undefined {
    return this.serviceMapping[serviceName];
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

  static determineServiceName(specificKey: string, genericKey: string, extractedKey: string, fallback: string): string {
    const mappedService = this.serviceMapping[specificKey] || this.serviceMapping[genericKey];
    if (mappedService) {
      return mappedService;
    }

    if (
      process.env.DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED === "false" ||
      process.env.DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED === "0"
    ) {
      return fallback;
    }

    return extractedKey?.trim() ? extractedKey : fallback;
  }

  createInferredSpanForApiGateway(
    event: any,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
    decodeAuthorizerContext: boolean = true,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const domain = event.requestContext.domainName || "";
    const path = event.rawPath || event.requestContext.path || event.requestContext.routeKey;
    const httpUrl = `https://${domain}${path}`;
    const resourcePath = this.getResourcePath(event);

    let method;
    if (event.requestContext.httpMethod) {
      method = event.requestContext.httpMethod;
    } else if (event.requestContext.http) {
      method = event.requestContext.http.method;
    }
    const resourceName = [method || domain, resourcePath].join(" ");
    const apiId = event.requestContext.apiId || "";
    const serviceName = SpanInferrer.determineServiceName(apiId, "lambda_api_gateway", domain, domain);

    options.tags = {
      operation_name: "aws.apigateway",
      "http.url": httpUrl,
      endpoint: path,
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      service: serviceName,
      "service.name": serviceName,
      "span.type": "http",
      "resource.name": resourceName,
      "peer.service": this.service,
      "span.kind": "server",
      apiid: apiId,
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
    const eventSourceSubType: HTTPEventSubType = HTTPEventTraceExtractor.getEventSubType(event);
    if (decodeAuthorizerContext) {
      try {
        const parsedUpstreamContext = HTTPEventTraceExtractor.getInjectedAuthorizerHeaders(event, eventSourceSubType);
        if (parsedUpstreamContext) {
          let upstreamSpanOptions: SpanOptions = {};
          const startTime = parsedUpstreamContext[parentSpanFinishTimeHeader] / 1e6;
          // getting an approximated endTime
          if (eventSourceSubType === HTTPEventSubType.ApiGatewayV2) {
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
        eventSourceSubType === HTTPEventSubType.ApiGatewayV1 ||
        eventSourceSubType === HTTPEventSubType.ApiGatewayWebSocket
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
    const domain: string = event.requestContext.domainName || "";
    const path = event.rawPath;
    const httpUrl = `https://${domain}${path}`;
    let method;
    if (event.requestContext.httpMethod) {
      method = event.requestContext.httpMethod;
    } else if (event.requestContext.http) {
      method = event.requestContext.http.method;
    }
    const resourceName = [method || domain, path].join(" ");
    const apiId: string = event.requestContext.apiId || "";
    const serviceName: string = SpanInferrer.determineServiceName(apiId, "lambda_url", domain, domain);

    options.tags = {
      operation_name: "aws.lambda.url",
      "http.url": httpUrl,
      endpoint: path,
      "http.method": event.requestContext.http.method,
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      service: serviceName,
      "service.name": serviceName,
      "span.type": "http",
      "resource.name": resourceName,
      "peer.service": this.service,
      "span.kind": "server",
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
    const [tableArn, tableName] = eventSourceARN?.split("/") || ["", ""];
    const resourceName = `${eventName} ${tableName}`;
    const serviceName = SpanInferrer.determineServiceName(tableName, "lambda_dynamodb", tableName, "aws.dynamodb");
    options.tags = {
      operation_name: "aws.dynamodb",
      tablename: tableName,
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      service: serviceName,
      "service.name": serviceName,
      "span.type": "web",
      "resource.name": resourceName,
      "peer.service": this.service,
      "span.kind": "server",
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

    let referenceRecord: SNSMessage;
    let eventSubscriptionArn = "";
    if (event.Records) {
      // Full SNS Event into Lambda
      const { Records } = event as SNSEvent;
      ({ Sns: referenceRecord, EventSubscriptionArn: eventSubscriptionArn } = Records[0]);
    } else {
      // SNS message wrapping an SQS message
      referenceRecord = event;
    }
    const { TopicArn, Timestamp, Type, Subject, MessageId } = referenceRecord;

    const topicName = TopicArn?.split(":").pop() || "";
    const resourceName = topicName;
    const serviceName = SpanInferrer.determineServiceName(topicName, "lambda_sns", topicName, "sns");
    options.tags = {
      operation_name: "aws.sns",
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      service: serviceName,
      "service.name": serviceName,
      "span.type": "sns",
      "resource.name": resourceName,
      "peer.service": this.service,
      "span.kind": "server",
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

    // EventSubscriptionARN not available for direct integrations to SQS from SNS.
    if (eventSubscriptionArn !== "") {
      options.tags.event_subscription_arn = eventSubscriptionArn;
    }
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
    const queueName = eventSourceARN?.split(":").pop() || "";
    const resourceName = queueName;
    const serviceName = SpanInferrer.determineServiceName(queueName, "lambda_sqs", queueName, "sqs");
    options.tags = {
      operation_name: "aws.sqs",
      resource_names: resourceName,
      request_id: context?.awsRequestId,
      service: serviceName,
      "service.name": serviceName,
      "span.type": "web",
      "resource.name": resourceName,
      "peer.service": this.service,
      "span.kind": "server",
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
    let upstreamSpan: SpanWrapper | null = null;
    try {
      let upstreamMessage: any;
      upstreamMessage = JSON.parse(body);
      if (upstreamMessage && upstreamMessage.TopicArn && upstreamMessage.Timestamp) {
        upstreamSpan = this.createInferredSpanForSns(upstreamMessage, context, parentSpanContext);
        upstreamSpan.finish(Number(SentTimestamp));
      } else if (upstreamMessage?.detail?._datadog) {
        upstreamSpan = this.createInferredSpanForEventBridge(upstreamMessage, context, parentSpanContext);
        upstreamSpan.finish(Number(SentTimestamp));
      }
    } catch (e) {
      // Pass, it's a raw SQS message
    }
    options.childOf = upstreamSpan ? upstreamSpan.span : parentSpanContext;

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
    const streamName = (eventSourceARN?.split(":").pop() || "").replace(/^stream\//, "");
    const shardId = eventID.split(":").pop();
    const serviceName = SpanInferrer.determineServiceName(streamName, "lambda_kinesis", streamName, "kinesis");
    options.tags = {
      operation_name: "aws.kinesis",
      resource_names: streamName,
      request_id: context?.awsRequestId,
      service: serviceName,
      "service.name": serviceName,
      "span.type": "web",
      "resource.name": streamName,
      "peer.service": this.service,
      "span.kind": "server",
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
    const serviceName = SpanInferrer.determineServiceName(bucketName, "lambda_s3", bucketName, "s3");
    options.tags = {
      operation_name: "aws.s3",
      resource_names: bucketName,
      request_id: context?.awsRequestId,
      service: serviceName,
      "service.name": serviceName,
      "span.type": "web",
      "resource.name": bucketName,
      "peer.service": this.service,
      "span.kind": "server",
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
    event: EventBridgeEvent<any, any>,
    context: Context | undefined,
    parentSpanContext: SpanContext | undefined,
  ): SpanWrapper {
    const options: SpanOptions = {};
    const { time, source } = event as EventBridgeEvent<any, any>;
    const serviceName = SpanInferrer.determineServiceName(source, "lambda_eventbridge", source, "eventbridge");
    options.tags = {
      operation_name: "aws.eventbridge",
      resource_names: source,
      request_id: context?.awsRequestId,
      service: serviceName,
      "service.name": serviceName,
      "span.type": "web",
      "resource.name": source,
      "peer.service": this.service,
      "span.kind": "server",
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

  getResourcePath(event: any): string {
    const routeKey = event?.requestContext?.routeKey;
    if (routeKey && routeKey.includes("{")) {
      // this is a parameterized route
      try {
        return event.requestContext.routeKey.split(" ")[1];
      } catch (e) {
        logDebug("Error parsing routeKey", e as Error);
      }
    }
    return event.rawPath || event.requestContext.resourcePath || routeKey;
  }
}
