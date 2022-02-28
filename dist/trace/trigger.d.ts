import { Context } from "aws-lambda";
export declare enum eventSources {
    apiGateway = "api-gateway",
    applicationLoadBalancer = "application-load-balancer",
    cloudFront = "cloudfront",
    cloudWatchEvents = "cloudwatch-events",
    cloudWatchLogs = "cloudwatch-logs",
    cloudWatch = "cloudwatch",
    dynamoDB = "dynamodb",
    eventBridge = "eventbridge",
    kinesis = "kinesis",
    s3 = "s3",
    sns = "sns",
    sqs = "sqs"
}
/**
 * parseEventSource parses the triggering event to determine the source
 * Possible Returns:
 * api-gateway | application-load-balancer | cloudwatch-logs |
 * cloudwatch-events | cloudfront | dynamodb | kinesis | s3 | sns | sqs
 */
export declare function parseEventSource(event: any): eventSources.apiGateway | eventSources.applicationLoadBalancer | eventSources.cloudFront | eventSources.cloudWatchEvents | eventSources.cloudWatchLogs | eventSources.dynamoDB | eventSources.eventBridge | eventSources.kinesis | eventSources.s3 | eventSources.sns | eventSources.sqs | undefined;
/**
 * parseEventSourceARN parses the triggering event to determine the event source's
 * ARN if available. Otherwise we stitch together the ARN
 */
export declare function parseEventSourceARN(source: string | undefined, event: any, context: Context): string | undefined;
/**
 * extractTriggerTags parses the trigger event object for tags to be added to the span metadata
 */
export declare function extractTriggerTags(event: any, context: Context): {
    [key: string]: string;
};
/**
 * extractHTTPStatusCode extracts a status code from the response if the Lambda was triggered
 * by API Gateway or ALB
 */
export declare function extractHTTPStatusCodeTag(triggerTags: {
    [key: string]: string;
} | undefined, result: any): string | undefined;
//# sourceMappingURL=trigger.d.ts.map