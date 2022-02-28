"use strict";
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpanInferrer = void 0;
var trigger_1 = require("./trigger");
var span_wrapper_1 = require("./span-wrapper");
var SpanInferrer = /** @class */ (function () {
    function SpanInferrer(traceWrapper) {
        this.traceWrapper = traceWrapper;
    }
    SpanInferrer.prototype.createInferredSpan = function (event, context, parentSpanContext) {
        var eventSource = (0, trigger_1.parseEventSource)(event);
        if (eventSource === trigger_1.eventSources.apiGateway) {
            return this.createInferredSpanForApiGateway(event, context, parentSpanContext);
        }
        if (eventSource === trigger_1.eventSources.sns) {
            return this.createInferredSpanForSns(event, context, parentSpanContext);
        }
        if (eventSource === trigger_1.eventSources.dynamoDB) {
            return this.createInferredSpanForDynamoDBStreamEvent(event, context, parentSpanContext);
        }
        if (eventSource === trigger_1.eventSources.sqs) {
            return this.createInferredSpanForSqs(event, context, parentSpanContext);
        }
        if (eventSource === trigger_1.eventSources.kinesis) {
            return this.createInferredSpanForKinesis(event, context, parentSpanContext);
        }
        if (eventSource === trigger_1.eventSources.s3) {
            return this.createInferredSpanForS3(event, context, parentSpanContext);
        }
        if (eventSource === trigger_1.eventSources.eventBridge) {
            return this.createInferredSpanForEventBridge(event, context, parentSpanContext);
        }
    };
    SpanInferrer.prototype.isApiGatewayAsync = function (event) {
        return (event.headers && event.headers["X-Amz-Invocation-Type"] && event.headers["X-Amz-Invocation-Type"] === "Event");
    };
    SpanInferrer.prototype.createInferredSpanForApiGateway = function (event, context, parentSpanContext) {
        var options = {};
        var domain = event.requestContext.domainName;
        var path = event.rawPath || event.requestContext.path || event.requestContext.routeKey;
        var resourcePath = event.rawPath || event.requestContext.resourcePath || event.requestContext.routeKey;
        var method;
        if (event.requestContext.httpMethod) {
            method = event.requestContext.httpMethod;
        }
        else if (event.requestContext.http) {
            method = event.requestContext.http.method;
        }
        var resourceName = [method || domain, resourcePath].join(" ");
        options.tags = {
            operation_name: "aws.apigateway",
            "http.url": domain + path,
            endpoint: path,
            resource_names: resourceName,
            request_id: context === null || context === void 0 ? void 0 : context.awsRequestId,
            "span.type": "http",
            "resource.name": resourceName,
            "service.name": domain,
            apiid: event.requestContext.apiId,
            service: domain,
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
        if (parentSpanContext) {
            options.childOf = parentSpanContext;
        }
        options.startTime = event.requestContext.timeEpoch;
        var spanWrapperOptions = {
            isAsync: this.isApiGatewayAsync(event),
        };
        return new span_wrapper_1.SpanWrapper(this.traceWrapper.startSpan("aws.apigateway", options), spanWrapperOptions);
    };
    SpanInferrer.prototype.createInferredSpanForDynamoDBStreamEvent = function (event, context, parentSpanContext) {
        var _a;
        var options = {};
        var Records = event.Records;
        var referenceRecord = Records[0];
        var eventSourceARN = referenceRecord.eventSourceARN, eventName = referenceRecord.eventName, eventVersion = referenceRecord.eventVersion, eventID = referenceRecord.eventID, dynamodb = referenceRecord.dynamodb;
        var _b = __read((eventSourceARN === null || eventSourceARN === void 0 ? void 0 : eventSourceARN.split("/")) || [undefined, undefined], 2), tableArn = _b[0], tableName = _b[1];
        var resourceName = "".concat(eventName, " ").concat(tableName);
        options.tags = {
            operation_name: "aws.dynamodb",
            tablename: tableName,
            resource_names: resourceName,
            request_id: context === null || context === void 0 ? void 0 : context.awsRequestId,
            "span.type": "web",
            "resource.name": resourceName,
            service: "aws.dynamodb",
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
        options.startTime = Number((_a = referenceRecord.dynamodb) === null || _a === void 0 ? void 0 : _a.ApproximateCreationDateTime) * 1000;
        var spanWrapperOptions = {
            isAsync: true,
        };
        return new span_wrapper_1.SpanWrapper(this.traceWrapper.startSpan("aws.dynamodb", options), spanWrapperOptions);
    };
    SpanInferrer.prototype.createInferredSpanForSns = function (event, context, parentSpanContext) {
        var options = {};
        var Records = event.Records;
        var referenceRecord = Records[0];
        var EventSubscriptionArn = referenceRecord.EventSubscriptionArn, _a = referenceRecord.Sns, TopicArn = _a.TopicArn, Timestamp = _a.Timestamp, Type = _a.Type, Subject = _a.Subject, MessageId = _a.MessageId;
        var topicName = TopicArn === null || TopicArn === void 0 ? void 0 : TopicArn.split(":").pop();
        var resourceName = topicName;
        options.tags = {
            operation_name: "aws.sns",
            resource_names: resourceName,
            request_id: context === null || context === void 0 ? void 0 : context.awsRequestId,
            "span.type": "sns",
            "resource.name": resourceName,
            service: "sns",
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
        var spanWrapperOptions = {
            isAsync: true,
        };
        return new span_wrapper_1.SpanWrapper(this.traceWrapper.startSpan("aws.sns", options), spanWrapperOptions);
    };
    SpanInferrer.prototype.createInferredSpanForSqsSns = function (event, context, parentSpanContext) {
        var options = {};
        var TopicArn = event.TopicArn, Timestamp = event.Timestamp, Type = event.Type, Subject = event.Subject, MessageId = event.MessageId;
        var topicName = TopicArn === null || TopicArn === void 0 ? void 0 : TopicArn.split(":").pop();
        var resourceName = topicName;
        options.tags = {
            operation_name: "aws.sns",
            resource_names: resourceName,
            "span.type": "sns",
            "resource.name": resourceName,
            service: "sns",
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
        var spanWrapperOptions = {
            isAsync: true,
        };
        return new span_wrapper_1.SpanWrapper(this.traceWrapper.startSpan("aws.sns", options), spanWrapperOptions);
    };
    SpanInferrer.prototype.createInferredSpanForSqs = function (event, context, parentSpanContext) {
        var options = {};
        var Records = event.Records;
        var referenceRecord = Records[0];
        var _a = referenceRecord.attributes, SentTimestamp = _a.SentTimestamp, ApproximateReceiveCount = _a.ApproximateReceiveCount, SenderId = _a.SenderId, eventSourceARN = referenceRecord.eventSourceARN, receiptHandle = referenceRecord.receiptHandle, body = referenceRecord.body;
        var queueName = eventSourceARN === null || eventSourceARN === void 0 ? void 0 : eventSourceARN.split(":").pop();
        var resourceName = queueName;
        options.tags = {
            operation_name: "aws.sqs",
            resource_names: resourceName,
            request_id: context === null || context === void 0 ? void 0 : context.awsRequestId,
            "span.type": "web",
            "resource.name": resourceName,
            "service.name": resourceName,
            service: "sqs",
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
        var upstreamSnsSpan = null;
        try {
            var upstreamSnsMessage = void 0;
            upstreamSnsMessage = JSON.parse(body);
            if (upstreamSnsMessage && upstreamSnsMessage.TopicArn && upstreamSnsMessage.Timestamp) {
                upstreamSnsSpan = this.createInferredSpanForSqsSns(upstreamSnsMessage, context, parentSpanContext);
                upstreamSnsSpan.finish(Number(SentTimestamp));
            }
        }
        catch (e) {
            // Pass, it's a raw SQS message
        }
        options.childOf = upstreamSnsSpan ? upstreamSnsSpan.span : parentSpanContext;
        options.startTime = Number(SentTimestamp);
        var spanWrapperOptions = {
            isAsync: true,
        };
        return new span_wrapper_1.SpanWrapper(this.traceWrapper.startSpan("aws.sqs", options), spanWrapperOptions);
    };
    SpanInferrer.prototype.createInferredSpanForKinesis = function (event, context, parentSpanContext) {
        var options = {};
        var Records = event.Records;
        var referenceRecord = Records[0];
        var _a = referenceRecord.kinesis, approximateArrivalTimestamp = _a.approximateArrivalTimestamp, partitionKey = _a.partitionKey, eventSourceARN = referenceRecord.eventSourceARN, eventName = referenceRecord.eventName, eventVersion = referenceRecord.eventVersion, eventID = referenceRecord.eventID;
        var streamName = eventSourceARN === null || eventSourceARN === void 0 ? void 0 : eventSourceARN.split(":").pop();
        var shardId = eventID.split(":").pop();
        options.tags = {
            operation_name: "aws.kinesis",
            resource_names: streamName,
            request_id: context === null || context === void 0 ? void 0 : context.awsRequestId,
            "span.type": "web",
            "resource.name": streamName,
            service: "kinesis",
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
        var spanWrapperOptions = {
            isAsync: true,
        };
        return new span_wrapper_1.SpanWrapper(this.traceWrapper.startSpan("aws.kinesis", options), spanWrapperOptions);
    };
    SpanInferrer.prototype.createInferredSpanForS3 = function (event, context, parentSpanContext) {
        var options = {};
        var Records = event.Records;
        var referenceRecord = Records[0];
        var _a = referenceRecord.s3, _b = _a.bucket, bucketName = _b.name, arn = _b.arn, _c = _a.object, key = _c.key, size = _c.size, eTag = _c.eTag, eventTime = referenceRecord.eventTime, eventName = referenceRecord.eventName;
        options.tags = {
            operation_name: "aws.s3",
            resource_names: bucketName,
            request_id: context === null || context === void 0 ? void 0 : context.awsRequestId,
            "span.type": "web",
            "resource.name": bucketName,
            service: "s3",
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
        var spanWrapperOptions = {
            isAsync: true,
        };
        return new span_wrapper_1.SpanWrapper(this.traceWrapper.startSpan("aws.s3", options), spanWrapperOptions);
    };
    SpanInferrer.prototype.createInferredSpanForEventBridge = function (event, context, parentSpanContext) {
        var options = {};
        var _a = event, time = _a.time, source = _a.source;
        options.tags = {
            operation_name: "aws.eventbridge",
            resource_names: source,
            request_id: context === null || context === void 0 ? void 0 : context.awsRequestId,
            "span.type": "web",
            "resource.name": source,
            service: "eventbridge",
            _inferred_span: {
                tag_source: "self",
                synchronicity: "async",
            },
        };
        if (parentSpanContext) {
            options.childOf = parentSpanContext;
        }
        options.startTime = Date.parse(time);
        var spanWrapperOptions = {
            isAsync: true,
        };
        return new span_wrapper_1.SpanWrapper(this.traceWrapper.startSpan("aws.eventbridge", options), spanWrapperOptions);
    };
    return SpanInferrer;
}());
exports.SpanInferrer = SpanInferrer;
//# sourceMappingURL=span-inferrer.js.map