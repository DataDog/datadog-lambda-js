import { gunzipSync } from "zlib";

const eventSources = ["aws:dynamodb", "aws:kinesis", "aws:s3", "aws:sns", "aws:sqs"] as const;

function getFirstRecord(event: any) {
	const records = event.Records;
	if (records && records.length > 0) {
		return records[0];
	}
}

/**
 * getEventSource determines the source of the trigger event
 * Possible Returns:
 * api-gateway | application-load-balancer | cloudwatch-logs |
 * cloudwatch-events | cloudfront | dynamodb | kinesis | s3 | sns | sqs
 */
export function getEventSource(event: any) {
	let eventSource = event.eventSource ?? event.EventSource;
	const requestContext = event.requestContext;

	if (requestContext && requestContext.stage) {
		eventSource = "api-gateway";
	}

	if (requestContext && requestContext.elb) {
		eventSource = "application-load-balancer";
	}

	if (event.awslogs) {
		eventSource = "cloudwatch-logs";
	}

	const eventDetail = event.detail;
	const cwEventCategories = eventDetail && eventDetail.EventCategories;
	if (event.source === "aws.events" || cwEventCategories) {
		eventSource = "cloudwatch-events";
	}

	const eventRecord = getFirstRecord(event);
	if (eventRecord) {
		eventSource = eventRecord.eventSource ?? eventRecord.EventSource;
		if (eventRecord.cf) {
			eventSource = "cloudfront";
		}
	}

	if (eventSources.includes(eventSource)) {
		eventSource = eventSource.split(":").pop();
	}
	return eventSource;
}

function parseEventSourceARN(source: string, event: any, context: any) {
	const splitFunctionArn = context.invokedFunctionArn.split(":");
	const region = splitFunctionArn[3];
	const accountId = splitFunctionArn[4];

	const eventRecord = getFirstRecord(event);
	// e.g. arn:aws:s3:::lambda-xyz123-abc890
	if (source === "s3") {
		return eventRecord.s3.bucket.arn;
	}

	// e.g. arn:aws:sns:us-east-1:123456789012:sns-lambda
	if (source === "sns") {
		return eventRecord.Sns.TopicArn;
	}

	// e.g. arn:aws:cloudfront::123456789012:distribution/ABC123XYZ
	if (source === "cloudfront") {
		const distributionId = eventRecord.cf.config.distributionId;
		return `arn:aws:cloudfront::${accountId}:distribution/${distributionId}`;
	}

	// e.g. arn:aws:apigateway:us-east-1::/restapis/xyz123/stages/default
	if (source === "api-gateway") {
		const requestContext = event.requestContext;
		return `arn:aws:apigateway:${region}::/restapis/${requestContext.apiId}/stages/${requestContext.stage}`;
	}

	// e.g. arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/lambda-xyz/123
	if (source === "application-load-balancer") {
		const requestContext = event.requestContext;
		return requestContext.elb.targetGroupArn;
	}

	// e.g. arn:aws:logs:us-west-1:123456789012:log-group:/my-log-group-xyz
	if (source === "cloudwatch-logs") {
		const buffer = Buffer.from(event.awslogs.data, "base64");
		const decompressed = gunzipSync(buffer).toString();
		const logs = JSON.parse(decompressed);
		return `arn:aws:logs:${region}:${accountId}:log-group:${logs.logGroup}`;
	}

	// e.g. arn:aws:events:us-east-1:123456789012:rule/my-schedule
	if (source === "cloudwatch-events" && event.resources) {
		return event.resources[0];
	}
}

export function getEventSourceARN(source: string, event: any, context: any) {
	let eventSourceARN = event.eventSourceARN ?? event.eventSourceArn;

	const eventRecord = getFirstRecord(event);
	if (eventRecord) {
		eventSourceARN = eventRecord.eventSourceARN ?? eventRecord.eventSourceArn;
	}

	if (eventSourceARN === undefined) {
		eventSourceARN = parseEventSourceARN(source, event, context);
	}
	return eventSourceARN;
}

/**
 * getHTTPTags extracts HTTP facet tags from the triggering event
 */
function getHTTPTags(event: any) {
	const httpTags: any = {};
	const requestContext = event.requestContext;
	let path = event.path;
	let method = event.httpMethod;

	if (requestContext && requestContext.stage) {
		if (requestContext.domainName) {
			httpTags["http.url"] = requestContext.domainName;
		}
		path = requestContext.path;
		method = requestContext.httpMethod;
		// Version 2.0 HTTP API Gateway
		const apigatewayV2HTTP = requestContext.http;
		if (event.version === "2.0" && apigatewayV2HTTP) {
			path = apigatewayV2HTTP.path;
			method = apigatewayV2HTTP.method;
		}
	}

	if (path) {
		httpTags["http.url_details.path"] = path;
	}
	if (method) {
		httpTags["http.method"] = method;
	}
	const headers = event.headers;
	if (headers && headers.Referer) {
		httpTags["http.referer"] = headers.Referer;
	}
	return httpTags;
}

/**
 * extractTriggerTags extracts span tags from the event object that triggered the Lambda
 */
export function extractTriggerTags(event: any, context: any) {
	let triggerTags: any = {};
	const eventSource = getEventSource(event);
	if (eventSource) {
		triggerTags["trigger.event_source"] = eventSource;

		const eventSourceARN = getEventSourceARN(eventSource, event, context);
		if (eventSourceARN) {
			triggerTags["trigger.event_source_arn"] = eventSourceARN;
		}
	}

	if (eventSource === "api-gateway" || eventSource === "application-load-balancer") {
		triggerTags = { ...triggerTags, ...getHTTPTags(event) };
	}
	return triggerTags;
}

/**
 * setHTTPStatusCodeTag sets a status code span tag if the Lambda was triggered
 * by API Gateway or ALB
 */
export function setHTTPStatusCodeTag(span: any, result: any) {
	if (span && result.statusCode) {
		span.setTag("http.status_code", result.statusCode);
	}
}
