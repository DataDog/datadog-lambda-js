import {
  Context,
  APIGatewayEvent,
  APIGatewayProxyEventV2,
  ALBEvent,
  CloudWatchLogsEvent,
  ScheduledEvent,
  CloudFrontRequestEvent,
  DynamoDBStreamEvent,
  KinesisStreamEvent,
  S3Event,
  SNSEvent,
  SQSEvent,
  EventBridgeEvent,
} from "aws-lambda";
import * as eventType from "../utils/event-type-guards";
import { logDebug } from "../utils";
import { gunzipSync } from "zlib";

type LambdaURLEvent = {
  headers: { [name: string]: string | undefined };
  requestContext: {
    domainName?: string | undefined;
    http: {
      method: string;
      path: string;
    };
  };
};

function isHTTPTriggerEvent(eventSource: string | undefined) {
  return (
    eventSource === "api-gateway" ||
    eventSource === "application-load-balancer" ||
    eventSource === "lambda-function-url"
  );
}

function getAWSPartitionByRegion(region: string) {
  if (region.startsWith("us-gov-")) {
    return "aws-us-gov";
  } else if (region.startsWith("cn-")) {
    return "aws-cn";
  } else {
    return "aws";
  }
}

function extractAPIGatewayRequestContext(event: APIGatewayEvent | APIGatewayProxyEventV2) {
  return event.requestContext;
}

function extractCloudFrontRequestEventDistributionId(event: CloudFrontRequestEvent) {
  return event.Records[0].cf.config.distributionId;
}

function extractCloudWatchLogsEventDecodedLogs(event: CloudWatchLogsEvent) {
  const buffer = Buffer.from(event.awslogs.data, "base64");
  const decompressed = gunzipSync(buffer).toString();
  return JSON.parse(decompressed);
}

function extractALBEventARN(event: ALBEvent) {
  return event.requestContext.elb.targetGroupArn;
}

function extractCloudWatchEventARN(event: ScheduledEvent) {
  return event.resources[0];
}

function extractDynamoDBStreamEventARN(event: DynamoDBStreamEvent) {
  return event.Records[0].eventSourceARN;
}

function extractKinesisStreamEventARN(event: KinesisStreamEvent) {
  return event.Records[0].eventSourceARN;
}

function extractS3EventARN(event: S3Event) {
  return event.Records[0].s3.bucket.arn;
}

function extractSNSEventARN(event: SNSEvent) {
  return event.Records[0].Sns.TopicArn;
}

function extractSQSEventARN(event: SQSEvent) {
  return event.Records[0].eventSourceARN;
}

function extractEventBridgeARN(event: EventBridgeEvent<any, any>) {
  return event.source;
}

export enum eventSources {
  apiGateway = "api-gateway",
  applicationLoadBalancer = "application-load-balancer",
  cloudFront = "cloudfront",
  cloudWatchEvents = "cloudwatch-events",
  cloudWatchLogs = "cloudwatch-logs",
  cloudWatch = "cloudwatch",
  dynamoDB = "dynamodb",
  eventBridge = "eventbridge",
  kinesis = "kinesis",
  lambdaUrl = "lambda-function-url",
  s3 = "s3",
  sns = "sns",
  sqs = "sqs",
}

/**
 * parseEventSource parses the triggering event to determine the source
 * Possible Returns:
 * api-gateway | application-load-balancer | cloudwatch-logs |
 * cloudwatch-events | cloudfront | dynamodb | kinesis | s3 | sns | sqs
 */
export function parseEventSource(event: any) {
  if (eventType.isLambdaUrlEvent(event)) {
    return eventSources.lambdaUrl;
  }
  if (
    eventType.isAPIGatewayEvent(event) ||
    eventType.isAPIGatewayEventV2(event) ||
    eventType.isAPIGatewayWebsocketEvent(event)
  ) {
    return eventSources.apiGateway;
  }
  if (eventType.isALBEvent(event)) {
    return eventSources.applicationLoadBalancer;
  }

  if (eventType.isCloudWatchLogsEvent(event)) {
    return eventSources.cloudWatchLogs;
  }

  if (eventType.isCloudWatchEvent(event)) {
    return eventSources.cloudWatchEvents;
  }

  if (eventType.isCloudFrontRequestEvent(event)) {
    return eventSources.cloudFront;
  }

  if (eventType.isDynamoDBStreamEvent(event)) {
    return eventSources.dynamoDB;
  }

  if (eventType.isKinesisStreamEvent(event)) {
    return eventSources.kinesis;
  }

  if (eventType.isS3Event(event)) {
    return eventSources.s3;
  }

  if (eventType.isSNSEvent(event)) {
    return eventSources.sns;
  }

  if (eventType.isSQSEvent(event)) {
    return eventSources.sqs;
  }

  if (eventType.isEventBridgeEvent(event)) {
    return eventSources.eventBridge;
  }
}

/**
 * parseEventSourceARN parses the triggering event to determine the event source's
 * ARN if available. Otherwise we stitch together the ARN
 */
export function parseEventSourceARN(source: string | undefined, event: any, context: Context) {
  const splitFunctionArn = context.invokedFunctionArn.split(":");
  const region = splitFunctionArn[3];
  const accountId = splitFunctionArn[4];
  const awsARN = getAWSPartitionByRegion(region);
  let eventSourceARN: string | undefined;

  // e.g. arn:aws:s3:::lambda-xyz123-abc890
  if (source === "s3") {
    eventSourceARN = extractS3EventARN(event);
  }

  // e.g. arn:aws:sns:us-east-1:123456789012:sns-lambda
  if (source === "sns") {
    eventSourceARN = extractSNSEventARN(event);
  }

  // // e.g. arn:aws:sqs:us-east-1:123456789012:MyQueue
  if (source === "sqs") {
    eventSourceARN = extractSQSEventARN(event);
  }

  // e.g. arn:aws:cloudfront::123456789012:distribution/ABC123XYZ
  if (source === "cloudfront") {
    const distributionId = extractCloudFrontRequestEventDistributionId(event);
    eventSourceARN = `arn:${awsARN}:cloudfront::${accountId}:distribution/${distributionId}`;
  }

  // e.g. arn:aws:apigateway:us-east-1::/restapis/xyz123/stages/default
  if (source === "api-gateway") {
    const requestContext = extractAPIGatewayRequestContext(event);
    eventSourceARN = `arn:${awsARN}:apigateway:${region}::/restapis/${requestContext.apiId}/stages/${requestContext.stage}`;
  }

  // e.g. arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/lambda-xyz/123
  if (source === "application-load-balancer") {
    eventSourceARN = extractALBEventARN(event);
  }

  // e.g. arn:aws:logs:us-west-1:123456789012:log-group:/my-log-group-xyz
  if (source === "cloudwatch-logs") {
    const logs = extractCloudWatchLogsEventDecodedLogs(event);
    eventSourceARN = `arn:${awsARN}:logs:${region}:${accountId}:log-group:${logs.logGroup}`;
  }

  // e.g. arn:aws:events:us-east-1:123456789012:rule/my-schedule
  if (source === "cloudwatch-events") {
    eventSourceARN = extractCloudWatchEventARN(event);
  }

  // arn:aws:dynamodb:us-east-1:123456789012:table/ExampleTableWithStream/stream/2015-06-27T00:48:05.899
  if (source === "dynamodb") {
    eventSourceARN = extractDynamoDBStreamEventARN(event);
  }

  // arn:aws:kinesis:EXAMPLE
  if (source === "kinesis") {
    eventSourceARN = extractKinesisStreamEventARN(event);
  }

  if (source === "eventbridge") {
    eventSourceARN = extractEventBridgeARN(event);
  }

  return eventSourceARN;
}

/**
 * extractHTTPTags extracts HTTP facet tags from the triggering event
 */
function extractHTTPTags(event: APIGatewayEvent | APIGatewayProxyEventV2 | ALBEvent | LambdaURLEvent) {
  const httpTags: { [key: string]: string } = {};

  if (eventType.isAPIGatewayEvent(event)) {
    const requestContext = event.requestContext;
    if (requestContext.domainName) {
      httpTags["http.url"] = requestContext.domainName;
    }
    httpTags["http.url_details.path"] = requestContext.path;
    httpTags["http.method"] = requestContext.httpMethod;
    if (event.headers?.Referer) {
      httpTags["http.referer"] = event.headers.Referer;
    }
    return httpTags;
  }

  if (eventType.isAPIGatewayEventV2(event)) {
    const requestContext = event.requestContext;
    httpTags["http.url"] = requestContext.domainName;
    httpTags["http.url_details.path"] = requestContext.http.path;
    httpTags["http.method"] = requestContext.http.method;
    if (event.headers?.Referer) {
      httpTags["http.referer"] = event.headers.Referer;
    }
    return httpTags;
  }

  if (eventType.isALBEvent(event)) {
    httpTags["http.url_details.path"] = event.path;
    httpTags["http.method"] = event.httpMethod;
    if (event.headers && event.headers.Referer) {
      httpTags["http.referer"] = event.headers.Referer;
    }
    return httpTags;
  }

  if (eventType.isLambdaUrlEvent(event)) {
    const requestContext = event.requestContext;
    if (requestContext.domainName) {
      httpTags["http.url"] = requestContext.domainName;
    }
    httpTags["http.url_details.path"] = requestContext.http.path;
    httpTags["http.method"] = requestContext.http.method;
    if (event.headers?.Referer) {
      httpTags["http.referer"] = event.headers.Referer;
    }
    return httpTags;
  }
}

/**
 * extractTriggerTags parses the trigger event object for tags to be added to the span metadata
 */
export function extractTriggerTags(event: any, context: Context) {
  let triggerTags: { [key: string]: string } = {};
  const eventSource = parseEventSource(event);
  if (eventSource) {
    triggerTags["function_trigger.event_source"] = eventSource;

    let eventSourceARN: string | undefined;
    try {
      eventSourceARN = parseEventSourceARN(eventSource, event, context);
    } catch (error) {
      logDebug(`failed to extract ${eventSource} arn from the event`, { error });
    }
    if (eventSourceARN) {
      triggerTags["function_trigger.event_source_arn"] = eventSourceARN;
    }
  }

  if (isHTTPTriggerEvent(eventSource)) {
    try {
      triggerTags = { ...triggerTags, ...extractHTTPTags(event) };
    } catch (error) {
      logDebug(`failed to extract http tags from ${eventSource} event`);
    }
  }
  return triggerTags;
}

/**
 * extractHTTPStatusCode extracts a status code from the response if the Lambda was triggered
 * by API Gateway or ALB
 */
export function extractHTTPStatusCodeTag(
  triggerTags: { [key: string]: string } | undefined,
  result: any,
): string | undefined {
  let eventSource: string | undefined;
  triggerTags ? (eventSource = triggerTags["function_trigger.event_source"]) : (eventSource = undefined);
  if (!isHTTPTriggerEvent(eventSource)) {
    return;
  }

  const resultStatusCode = result?.statusCode;
  // Return a 502 status if no response is found
  if (result === undefined) {
    return "502";
  } else if (resultStatusCode) {
    // Type check the statusCode if available
    if (typeof resultStatusCode === "number") {
      return resultStatusCode.toString();
    }
  } else {
    return "200";
  }
}
