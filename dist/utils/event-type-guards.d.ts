import { APIGatewayEvent, APIGatewayProxyEventV2, AppSyncResolverEvent, ALBEvent, CloudWatchLogsEvent, ScheduledEvent, CloudFrontRequestEvent, DynamoDBStreamEvent, KinesisStreamEvent, S3Event, SNSEvent, SQSEvent, EventBridgeEvent } from "aws-lambda";
export declare function isAPIGatewayEvent(event: any): event is APIGatewayEvent;
export declare function isAPIGatewayEventV2(event: any): event is APIGatewayProxyEventV2;
export declare function isAPIGatewayWebsocketEvent(event: any): event is any;
export declare function isALBEvent(event: any): event is ALBEvent;
export declare function isCloudWatchLogsEvent(event: any): event is CloudWatchLogsEvent;
export declare function isCloudWatchEvent(event: any): event is ScheduledEvent;
export declare function isCloudFrontRequestEvent(event: any): event is CloudFrontRequestEvent;
export declare function isDynamoDBStreamEvent(event: any): event is DynamoDBStreamEvent;
export declare function isKinesisStreamEvent(event: any): event is KinesisStreamEvent;
export declare function isS3Event(event: any): event is S3Event;
export declare function isSNSEvent(event: any): event is SNSEvent;
export declare function isSQSEvent(event: any): event is SQSEvent;
export declare function isSNSSQSEvent(event: any): event is SQSEvent;
export declare function isAppSyncResolverEvent(event: any): event is AppSyncResolverEvent<any>;
export declare function isEventBridgeEvent(event: any): event is EventBridgeEvent<any, any>;
//# sourceMappingURL=event-type-guards.d.ts.map