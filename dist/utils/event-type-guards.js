"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEventBridgeEvent = exports.isAppSyncResolverEvent = exports.isSNSSQSEvent = exports.isSQSEvent = exports.isSNSEvent = exports.isS3Event = exports.isKinesisStreamEvent = exports.isDynamoDBStreamEvent = exports.isCloudFrontRequestEvent = exports.isCloudWatchEvent = exports.isCloudWatchLogsEvent = exports.isALBEvent = exports.isAPIGatewayWebsocketEvent = exports.isAPIGatewayEventV2 = exports.isAPIGatewayEvent = void 0;
var constants_1 = require("../trace/constants");
function isAPIGatewayEvent(event) {
    var _a;
    return ((_a = event.requestContext) === null || _a === void 0 ? void 0 : _a.stage) !== undefined && event.httpMethod !== undefined && event.resource !== undefined;
}
exports.isAPIGatewayEvent = isAPIGatewayEvent;
function isAPIGatewayEventV2(event) {
    return (event.requestContext !== undefined &&
        event.version === constants_1.apiGatewayEventV2 &&
        event.rawQueryString !== undefined &&
        !event.requestContext.domainName.includes("lambda-url"));
}
exports.isAPIGatewayEventV2 = isAPIGatewayEventV2;
function isAPIGatewayWebsocketEvent(event) {
    return event.requestContext !== undefined && event.requestContext.messageDirection !== undefined;
}
exports.isAPIGatewayWebsocketEvent = isAPIGatewayWebsocketEvent;
function isALBEvent(event) {
    return event.requestContext !== undefined && event.requestContext.elb !== undefined;
}
exports.isALBEvent = isALBEvent;
function isCloudWatchLogsEvent(event) {
    return event.awslogs !== undefined;
}
exports.isCloudWatchLogsEvent = isCloudWatchLogsEvent;
function isCloudWatchEvent(event) {
    return event.source !== undefined && event.source === "aws.events";
}
exports.isCloudWatchEvent = isCloudWatchEvent;
function isCloudFrontRequestEvent(event) {
    return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].cf !== undefined;
}
exports.isCloudFrontRequestEvent = isCloudFrontRequestEvent;
function isDynamoDBStreamEvent(event) {
    return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].dynamodb !== undefined;
}
exports.isDynamoDBStreamEvent = isDynamoDBStreamEvent;
function isKinesisStreamEvent(event) {
    return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].kinesis !== undefined;
}
exports.isKinesisStreamEvent = isKinesisStreamEvent;
function isS3Event(event) {
    return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].s3 !== undefined;
}
exports.isS3Event = isS3Event;
function isSNSEvent(event) {
    return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].Sns !== undefined;
}
exports.isSNSEvent = isSNSEvent;
function isSQSEvent(event) {
    return Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].eventSource === "aws:sqs";
}
exports.isSQSEvent = isSQSEvent;
function isSNSSQSEvent(event) {
    if (Array.isArray(event.Records) && event.Records.length > 0 && event.Records[0].eventSource === "aws:sqs") {
        try {
            var body = JSON.parse(event.Records[0].body);
            if (body.Type === "Notification" && body.TopicArn) {
                return true;
            }
        }
        catch (e) {
            return false;
        }
    }
    return false;
}
exports.isSNSSQSEvent = isSNSSQSEvent;
function isAppSyncResolverEvent(event) {
    return event.info !== undefined && event.info.selectionSetGraphQL !== undefined;
}
exports.isAppSyncResolverEvent = isAppSyncResolverEvent;
function isEventBridgeEvent(event) {
    return event["detail-type"] !== undefined;
}
exports.isEventBridgeEvent = isEventBridgeEvent;
//# sourceMappingURL=event-type-guards.js.map