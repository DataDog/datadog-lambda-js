import {
  APIGatewayEvent,
  APIGatewayProxyEventV2,
  AppSyncResolverEvent,
  ALBEvent,
  CloudWatchLogsEvent,
  ScheduledEvent,
  CloudFrontRequestEvent,
  DynamoDBStreamEvent,
  KinesisStreamEvent,
  S3Event,
  SNSEvent,
  SQSEvent,
  SNSMessage,
  EventBridgeEvent,
} from "aws-lambda";
import { apiGatewayEventV2 } from "../trace/constants";

export function isAPIGatewayEvent(event: any): event is APIGatewayEvent {
  return event.requestContext?.stage !== undefined && event.httpMethod !== undefined && event.resource !== undefined;
}

export function isAPIGatewayEventV2(event: any): event is APIGatewayProxyEventV2 {
  return (
    event.requestContext !== undefined &&
    event.version === apiGatewayEventV2 &&
    event.rawQueryString !== undefined &&
    !event.requestContext.domainName.includes("lambda-url")
  );
}

export function isAPIGatewayWebsocketEvent(event: any): event is any {
  return event.requestContext !== undefined && event.requestContext.messageDirection !== undefined;
}

export function isALBEvent(event: any): event is ALBEvent {
  return event.requestContext !== undefined && event.requestContext.elb !== undefined;
}

export function isCloudWatchLogsEvent(event: any): event is CloudWatchLogsEvent {
  return event.awslogs !== undefined;
}

export function isCloudWatchEvent(event: any): event is ScheduledEvent {
  return event.source !== undefined && event.source === "aws.events";
}

export function isCloudFrontRequestEvent(event: any): event is CloudFrontRequestEvent {
  return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].cf !== undefined;
}

export function isDynamoDBStreamEvent(event: any): event is DynamoDBStreamEvent {
  return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].dynamodb !== undefined;
}

export function isKinesisStreamEvent(event: any): event is KinesisStreamEvent {
  return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].kinesis !== undefined;
}

export function isS3Event(event: any): event is S3Event {
  return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].s3 !== undefined;
}

export function isSNSEvent(event: any): event is SNSEvent {
  return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].Sns !== undefined;
}

export function isSQSEvent(event: any): event is SQSEvent {
  return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].eventSource === "aws:sqs";
}

export function isSNSSQSEvent(event: any): event is SQSEvent {
  if (Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].eventSource === "aws:sqs") {
    try {
      const body = JSON.parse(event.Records[0].body) as SNSMessage;
      if (body.Type === "Notification" && body.TopicArn) {
        return true;
      }
    } catch (e) {
      return false;
    }
  }
  return false;
}

export function isAppSyncResolverEvent(event: any): event is AppSyncResolverEvent<any> {
  return event.info !== undefined && event.info.selectionSetGraphQL !== undefined;
}

export function isEventBridgeEvent(event: any): event is EventBridgeEvent<any, any> {
  return event["detail-type"] !== undefined;
}

export function isLambdaUrlEvent(event: any): boolean {
  return event?.requestContext?.domainName?.includes("lambda-url");
}
