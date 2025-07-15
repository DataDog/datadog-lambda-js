import {
  APIGatewayEvent,
  APIGatewayProxyEventV2,
  AppSyncResolverEvent,
  EventBridgeEvent,
  KinesisStreamEvent,
  SNSEvent,
  SNSMessage,
  SQSEvent,
} from "aws-lambda";

const API_GATEWAY_EVENT_V2_VERSION = "2.0";

export class EventValidator {
  static isAPIGatewayEvent(event: any): event is APIGatewayEvent {
    return event.requestContext?.stage !== undefined && event.httpMethod !== undefined && event.resource !== undefined;
  }

  static isAPIGatewayEventV2(event: any): event is APIGatewayProxyEventV2 {
    return (
      event.requestContext !== undefined &&
      event.version === API_GATEWAY_EVENT_V2_VERSION &&
      event.rawQueryString !== undefined &&
      !event.requestContext.domainName.includes("lambda-url")
    );
  }

  static isAPIGatewayWebSocketEvent(event: any): event is any {
    return event.requestContext !== undefined && event.requestContext.messageDirection !== undefined;
  }

  static isSNSEvent(event: any): event is SNSEvent {
    return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].Sns !== undefined;
  }

  static isSNSSQSEvent(event: any): event is SQSEvent {
    if (Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].eventSource === "aws:sqs") {
      try {
        const body = JSON.parse(event.Records[0].body) as SNSMessage;
        if (body.Type === "Notification" && body.TopicArn) {
          return true;
        }
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  static isEventBridgeSQSEvent(event: any): event is SQSEvent {
    if (Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].eventSource === "aws:sqs") {
      try {
        const body = JSON.parse(event.Records[0].body) as EventBridgeEvent<any, any>;
        return body["detail-type"] !== undefined;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  static isEventBridgeSNSEvent(event: any): event is SNSEvent {
    if (Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].Sns !== undefined) {
      try {
        const message = JSON.parse(event.Records[0].Sns.Message) as EventBridgeEvent<any, any>;
        return message["detail-type"] !== undefined;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  static isAppSyncResolverEvent(event: any): event is AppSyncResolverEvent<any> {
    return event.info !== undefined && event.info.selectionSetGraphQL !== undefined;
  }

  static isSQSEvent(event: any): event is SQSEvent {
    return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].eventSource === "aws:sqs";
  }

  static isEventBridgeEvent(event: any): event is EventBridgeEvent<any, any> {
    return event["detail-type"] !== undefined;
  }

  static isKinesisStreamEvent(event: any): event is KinesisStreamEvent {
    return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].kinesis !== undefined;
  }
}
