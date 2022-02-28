"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractHTTPStatusCodeTag = exports.extractTriggerTags = exports.parseEventSourceARN = exports.parseEventSource = exports.eventSources = void 0;
var eventType = __importStar(require("../utils/event-type-guards"));
var utils_1 = require("../utils");
var zlib_1 = require("zlib");
function isHTTPTriggerEvent(eventSource) {
    return (eventSource === "api-gateway" ||
        eventSource === "application-load-balancer" ||
        eventSource === "lambda-function-url");
}
function getAWSPartitionByRegion(region) {
    if (region.startsWith("us-gov-")) {
        return "aws-us-gov";
    }
    else if (region.startsWith("cn-")) {
        return "aws-cn";
    }
    else {
        return "aws";
    }
}
function extractAPIGatewayRequestContext(event) {
    return event.requestContext;
}
function extractCloudFrontRequestEventDistributionId(event) {
    return event.Records[0].cf.config.distributionId;
}
function extractCloudWatchLogsEventDecodedLogs(event) {
    var buffer = Buffer.from(event.awslogs.data, "base64");
    var decompressed = (0, zlib_1.gunzipSync)(buffer).toString();
    return JSON.parse(decompressed);
}
function extractALBEventARN(event) {
    return event.requestContext.elb.targetGroupArn;
}
function extractCloudWatchEventARN(event) {
    return event.resources[0];
}
function extractDynamoDBStreamEventARN(event) {
    return event.Records[0].eventSourceARN;
}
function extractKinesisStreamEventARN(event) {
    return event.Records[0].eventSourceARN;
}
function extractS3EventARN(event) {
    return event.Records[0].s3.bucket.arn;
}
function extractSNSEventARN(event) {
    return event.Records[0].Sns.TopicArn;
}
function extractSQSEventARN(event) {
    return event.Records[0].eventSourceARN;
}
function extractEventBridgeARN(event) {
    return event.source;
}
var eventSources;
(function (eventSources) {
    eventSources["apiGateway"] = "api-gateway";
    eventSources["applicationLoadBalancer"] = "application-load-balancer";
    eventSources["cloudFront"] = "cloudfront";
    eventSources["cloudWatchEvents"] = "cloudwatch-events";
    eventSources["cloudWatchLogs"] = "cloudwatch-logs";
    eventSources["cloudWatch"] = "cloudwatch";
    eventSources["dynamoDB"] = "dynamodb";
    eventSources["eventBridge"] = "eventbridge";
    eventSources["kinesis"] = "kinesis";
    eventSources["s3"] = "s3";
    eventSources["sns"] = "sns";
    eventSources["sqs"] = "sqs";
})(eventSources = exports.eventSources || (exports.eventSources = {}));
/**
 * parseEventSource parses the triggering event to determine the source
 * Possible Returns:
 * api-gateway | application-load-balancer | cloudwatch-logs |
 * cloudwatch-events | cloudfront | dynamodb | kinesis | s3 | sns | sqs
 */
function parseEventSource(event) {
    if (eventType.isAPIGatewayEvent(event) ||
        eventType.isAPIGatewayEventV2(event) ||
        eventType.isAPIGatewayWebsocketEvent(event)) {
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
exports.parseEventSource = parseEventSource;
/**
 * parseEventSourceARN parses the triggering event to determine the event source's
 * ARN if available. Otherwise we stitch together the ARN
 */
function parseEventSourceARN(source, event, context) {
    var splitFunctionArn = context.invokedFunctionArn.split(":");
    var region = splitFunctionArn[3];
    var accountId = splitFunctionArn[4];
    var awsARN = getAWSPartitionByRegion(region);
    var eventSourceARN;
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
        var distributionId = extractCloudFrontRequestEventDistributionId(event);
        eventSourceARN = "arn:".concat(awsARN, ":cloudfront::").concat(accountId, ":distribution/").concat(distributionId);
    }
    // e.g. arn:aws:apigateway:us-east-1::/restapis/xyz123/stages/default
    if (source === "api-gateway") {
        var requestContext = extractAPIGatewayRequestContext(event);
        eventSourceARN = "arn:".concat(awsARN, ":apigateway:").concat(region, "::/restapis/").concat(requestContext.apiId, "/stages/").concat(requestContext.stage);
    }
    // e.g. arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/lambda-xyz/123
    if (source === "application-load-balancer") {
        eventSourceARN = extractALBEventARN(event);
    }
    // e.g. arn:aws:logs:us-west-1:123456789012:log-group:/my-log-group-xyz
    if (source === "cloudwatch-logs") {
        var logs = extractCloudWatchLogsEventDecodedLogs(event);
        eventSourceARN = "arn:".concat(awsARN, ":logs:").concat(region, ":").concat(accountId, ":log-group:").concat(logs.logGroup);
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
exports.parseEventSourceARN = parseEventSourceARN;
/**
 * extractHTTPTags extracts HTTP facet tags from the triggering event
 */
function extractHTTPTags(event) {
    var _a, _b;
    var httpTags = {};
    if (eventType.isAPIGatewayEvent(event)) {
        var requestContext = event.requestContext;
        if (requestContext.domainName) {
            httpTags["http.url"] = requestContext.domainName;
        }
        httpTags["http.url_details.path"] = requestContext.path;
        httpTags["http.method"] = requestContext.httpMethod;
        if ((_a = event.headers) === null || _a === void 0 ? void 0 : _a.Referer) {
            httpTags["http.referer"] = event.headers.Referer;
        }
        return httpTags;
    }
    if (eventType.isAPIGatewayEventV2(event)) {
        var requestContext = event.requestContext;
        httpTags["http.url"] = requestContext.domainName;
        httpTags["http.url_details.path"] = requestContext.http.path;
        httpTags["http.method"] = requestContext.http.method;
        if ((_b = event.headers) === null || _b === void 0 ? void 0 : _b.Referer) {
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
}
/**
 * extractTriggerTags parses the trigger event object for tags to be added to the span metadata
 */
function extractTriggerTags(event, context) {
    var triggerTags = {};
    var eventSource = parseEventSource(event);
    if (eventSource) {
        triggerTags["function_trigger.event_source"] = eventSource;
        var eventSourceARN = void 0;
        try {
            eventSourceARN = parseEventSourceARN(eventSource, event, context);
        }
        catch (error) {
            (0, utils_1.logError)("failed to extract ".concat(eventSource, " arn from the event"), { error: error });
        }
        if (eventSourceARN) {
            triggerTags["function_trigger.event_source_arn"] = eventSourceARN;
        }
    }
    if (isHTTPTriggerEvent(eventSource)) {
        try {
            triggerTags = __assign(__assign({}, triggerTags), extractHTTPTags(event));
        }
        catch (error) {
            (0, utils_1.logError)("failed to extract http tags from ".concat(eventSource, " event"));
        }
    }
    return triggerTags;
}
exports.extractTriggerTags = extractTriggerTags;
/**
 * extractHTTPStatusCode extracts a status code from the response if the Lambda was triggered
 * by API Gateway or ALB
 */
function extractHTTPStatusCodeTag(triggerTags, result) {
    var eventSource;
    triggerTags ? (eventSource = triggerTags["function_trigger.event_source"]) : (eventSource = undefined);
    if (!isHTTPTriggerEvent(eventSource)) {
        return;
    }
    var resultStatusCode = result === null || result === void 0 ? void 0 : result.statusCode;
    // Return a 502 status if no response is found
    if (result === undefined) {
        return "502";
    }
    else if (resultStatusCode) {
        // Type check the statusCode if available
        if (typeof resultStatusCode === "number") {
            return resultStatusCode.toString();
        }
    }
    else {
        return "200";
    }
}
exports.extractHTTPStatusCodeTag = extractHTTPStatusCodeTag;
//# sourceMappingURL=trigger.js.map