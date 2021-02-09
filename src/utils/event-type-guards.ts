import {
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
} from "aws-lambda";

export function isAPIGatewayEvent(event: any): event is APIGatewayEvent {
  return event.requestContext !== undefined && event.requestContext.stage !== undefined;
}

export function isAPIGatewayEventV2(event: any): event is APIGatewayProxyEventV2 {
  return event.requestContext !== undefined && event.version !== undefined;
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
