import { Context } from "aws-lambda";
import { SpanInferrer } from "./span-inferrer";
import { SpanContext, TracerWrapper } from "./tracer-wrapper";
import { DD_SERVICE_ENV_VAR } from "./constants";
const snssqsEvent = require("../../event_samples/snssqs.json");
const snsEvent = require("../../event_samples/sns.json");
const sqsEvent = require("../../event_samples/sqs.json");
const ddbEvent = require("../../event_samples/dynamodb.json");
const kinesisEvent = require("../../event_samples/kinesis.json");
const eventBridgeEvent = require("../../event_samples/eventbridge.json");
const eventBridgeSQSEvent = require("../../event_samples/eventbridge-sqs.json");
const webSocketEvent = require("../../event_samples/api-gateway-wss.json");
const apiGatewayV1 = require("../../event_samples/api-gateway-v1.json");
const apiGatewayV2 = require("../../event_samples/api-gateway-v2.json");
const apiGatewayV1Parametrized = require("../../event_samples/api-gateway-v1-parametrized.json");
const apiGatewayV2Parametrized = require("../../event_samples/api-gateway-v2-parametrized.json");
const apiGatewayV1RequestAuthorizer = require("../../event_samples/api-gateway-traced-authorizer-request-v1.json");
const apiGatewayV1RequestAuthorizerCached = require("../../event_samples/api-gateway-traced-authorizer-request-v1-cached.json");
const apiGatewayV1TokenAuthorizer = require("../../event_samples/api-gateway-traced-authorizer-token-v1.json");
const apiGatewayV1TokenAuthorizerCached = require("../../event_samples/api-gateway-traced-authorizer-token-v1-cached.json");
const apiGatewayV2RequestAuthorizer = require("../../event_samples/api-gateway-traced-authorizer-request-v2.json");
const apiGatewayV2TokenAuthorizerCached = require("../../event_samples/api-gateway-traced-authorizer-request-v2-cached.json");
const apiGatewayWSSRequestAuthorizerConnect = require("../../event_samples/api-gateway-traced-authorizer-request-websocket-connect.json");
const apiGatewayWSSRequestAuthorizerMessage = require("../../event_samples/api-gateway-traced-authorizer-request-websocket-message.json");
const s3Event = require("../../event_samples/s3.json");
const functionUrlEvent = require("../../event_samples/lambda-function-urls.json");
const mockWrapper = {
  startSpan: jest.fn(),
};

describe("SpanInferrer", () => {
  let oldEnv: any;
  beforeEach(() => {
    mockWrapper.startSpan.mockClear();

    oldEnv = process.env;
    process.env = {
      [DD_SERVICE_ENV_VAR]: "mock-lambda-service",
    };
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  afterEach(() => {
    delete process.env.DD_SERVICE_MAPPING;
    (SpanInferrer as any).serviceMapping = {};
  });

  function getStartSpanServiceTag(callNumber: number) {
    const tags = mockWrapper.startSpan.mock.calls[callNumber - 1][1].tags;

    // Ensure that the service.name exists in the tags
    if (!tags["service.name"]) {
      throw new Error("The tag service.name is missing in the startSpan call.");
    }

    return tags["service.name"];
  }

  it("initializes service mapping correctly", () => {
    process.env.DD_SERVICE_MAPPING = "key1:value1,key2:value2";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    expect(SpanInferrer.getServiceMapping("key1")).toBe("value1");
    expect(SpanInferrer.getServiceMapping("key2")).toBe("value2");
  });

  it("returns undefined when service name is not found in service mapping", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    expect(SpanInferrer.getServiceMapping("non_existent_key")).toBe(undefined);
  });

  it("determines service name correctly based on specific key", () => {
    process.env.DD_SERVICE_MAPPING = "key1:value1,key2:value2";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    const serviceName = SpanInferrer.determineServiceName("key1", "key2", "fallback");
    expect(serviceName).toBe("value1");
  });

  it("determines service name correctly based on generic key when specific key is not in service mapping", () => {
    process.env.DD_SERVICE_MAPPING = "key1:value1,key2:value2";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    const serviceName = SpanInferrer.determineServiceName("non_existent_key", "key2", "fallback");
    expect(serviceName).toBe("value2");
  });

  it("falls back to fallback value when neither specific nor generic key is in service mapping", () => {
    process.env.DD_SERVICE_MAPPING = "key1:value1,key2:value2";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    const serviceName = SpanInferrer.determineServiceName("non_existent_key", "another_non_existent_key", "fallback");
    expect(serviceName).toBe("fallback");
  });

  it("falls back to default span service name when service mapping has incorrect delimiters", () => {
    process.env.DD_SERVICE_MAPPING = "key1-value1,key2=value2";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(snsEvent, {} as any, {} as SpanContext);
    expect(getStartSpanServiceTag(1)).toBe("sns");
  });

  it("falls back to default span service name when service mapping has no value for a key", () => {
    process.env.DD_SERVICE_MAPPING = "key1:value1,key2:";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(snsEvent, {} as any, {} as SpanContext);
    expect(getStartSpanServiceTag(1)).toBe("sns");
  });

  it("falls back to default span service name when service mapping has no key", () => {
    process.env.DD_SERVICE_MAPPING = "key1:value1,:value2";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(snsEvent, {} as any, {} as SpanContext);
    expect(getStartSpanServiceTag(1)).toBe("sns");
  });

  it("falls back to default span service name when service mapping is not set", () => {
    delete process.env.DD_SERVICE_MAPPING;
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(snsEvent, {} as any, {} as SpanContext);
    expect(getStartSpanServiceTag(1)).toBe("sns");
  });

  it("handles mappings without a value", () => {
    process.env.DD_SERVICE_MAPPING = "key1:value1,key2:";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    expect(SpanInferrer.getServiceMapping("key1")).toBe("value1");
    expect(SpanInferrer.getServiceMapping("key2")).toBe(undefined);
  });

  it("ignores mappings without a key", () => {
    process.env.DD_SERVICE_MAPPING = "key1:value1,:value2";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    expect(SpanInferrer.getServiceMapping("")).toBe(undefined);
  });

  it("returns undefined for mappings with incorrect delimiters", () => {
    process.env.DD_SERVICE_MAPPING = "key1-value1,key2=value2";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    expect(SpanInferrer.getServiceMapping("key1")).toBe(undefined);
    expect(SpanInferrer.getServiceMapping("key2")).toBe(undefined);
  });

  it("handles mappings with additional whitespace", () => {
    process.env.DD_SERVICE_MAPPING = "key1 : value1 , key2 : value2";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    expect(SpanInferrer.getServiceMapping("key1")).toBe("value1");
    expect(SpanInferrer.getServiceMapping("key2")).toBe("value2");
  });

  it("returns undefined when service mapping is not set", () => {
    delete process.env.DD_SERVICE_MAPPING;
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    expect(SpanInferrer.getServiceMapping("key1")).toBe(undefined);
  });

  it("ignores mappings with the same key and value", () => {
    process.env.DD_SERVICE_MAPPING = "key1:key1";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    expect(SpanInferrer.getServiceMapping("key1")).toBe(undefined);
  });

  it("ignores mappings with more than one colon", () => {
    process.env.DD_SERVICE_MAPPING = "key1:value1:value2";
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    expect(SpanInferrer.getServiceMapping("key1")).toBe(undefined);
  });

  it("remaps all SNS inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);

    (SpanInferrer as any).serviceMapping = { lambda_sns: "new-name" };

    inferrer.createInferredSpan(snsEvent, {} as any, {} as SpanContext);

    let modifiedSnsEvent = JSON.parse(JSON.stringify(snsEvent));
    modifiedSnsEvent.Records[0].EventSubscriptionArn = "arn:aws:sns:us-east-1:123456789012:DifferentTopic";
    inferrer.createInferredSpan(modifiedSnsEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("new-name");
  });

  it("remaps specific SNS inferred span service name based on DD_SERVICE_MAPPING topicname", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);

    (SpanInferrer as any).serviceMapping = { DifferentTopic: "new-name" };

    inferrer.createInferredSpan(snsEvent, {} as any, {} as SpanContext);

    let modifiedSnsEvent = JSON.parse(JSON.stringify(snsEvent));
    modifiedSnsEvent.Records[0].Sns.TopicArn = "arn:aws:sns:us-east-1:123456789012:DifferentTopic";
    inferrer.createInferredSpan(modifiedSnsEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("sns");
    expect(getStartSpanServiceTag(2)).toBe("new-name");
  });

  it("remaps all SQS inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);

    (SpanInferrer as any).serviceMapping = { lambda_sqs: "new-name" };

    inferrer.createInferredSpan(sqsEvent, {} as any, {} as SpanContext);

    let modifiedSqsEvent = JSON.parse(JSON.stringify(sqsEvent));
    modifiedSqsEvent.Records[0].eventSourceARN = "arn:aws:sqs:us-east-1:123456789012:DifferentQueue";
    inferrer.createInferredSpan(modifiedSqsEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("new-name");
  });

  it("remaps specific SQS inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { MyQueue: "new-name" };

    inferrer.createInferredSpan(sqsEvent, {} as any, {} as SpanContext);

    let modifiedDdbEvent = JSON.parse(JSON.stringify(sqsEvent));
    modifiedDdbEvent.Records[0].eventSourceARN = "arn:aws:sqs:us-east-1:123456789012:DifferentQueue";
    inferrer.createInferredSpan(modifiedDdbEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("sqs");
  });

  it("remaps all ddb inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { lambda_dynamodb: "new-name" };

    inferrer.createInferredSpan(ddbEvent, {} as any, {} as SpanContext);

    let modifiedDdbEvent = JSON.parse(JSON.stringify(ddbEvent));
    modifiedDdbEvent.Records[0].eventSourceARN =
      "arn:aws:dynamodb:us-east-1:123456789012:table/DifferentTableWithStream/stream/2015-06-27T00:48:05.899";
    inferrer.createInferredSpan(modifiedDdbEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("new-name");
  });

  it("remaps specific ddb inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { ExampleTableWithStream: "new-name" };

    inferrer.createInferredSpan(ddbEvent, {} as any, {} as SpanContext);

    let modifiedDdbEvent = JSON.parse(JSON.stringify(ddbEvent));
    modifiedDdbEvent.Records[0].eventSourceARN =
      "arn:aws:dynamodb:us-east-1:123456789012:table/DifferentTableWithStream/stream/2015-06-27T00:48:05.899";
    inferrer.createInferredSpan(modifiedDdbEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("aws.dynamodb");
  });

  it("remaps all kinesis inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { lambda_kinesis: "new-name" };

    inferrer.createInferredSpan(kinesisEvent, {} as any, {} as SpanContext);

    let modifiedKinesisEvent = JSON.parse(JSON.stringify(kinesisEvent));
    modifiedKinesisEvent.Records[0].eventSourceARN = "arn:aws:kinesis:DIFFERENT_EXAMPLE";
    inferrer.createInferredSpan(modifiedKinesisEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("new-name");
  });

  it("remaps specific kinesis inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { EXAMPLE: "new-name" };

    inferrer.createInferredSpan(kinesisEvent, {} as any, {} as SpanContext);

    let modifiedKinesisEvent = JSON.parse(JSON.stringify(kinesisEvent));
    modifiedKinesisEvent.Records[0].eventSourceARN = "arn:aws:kinesis:DIFFERENT_EXAMPLE";
    inferrer.createInferredSpan(modifiedKinesisEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("kinesis");
  });

  it("remaps sns sqs inferred spans service names based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { lambda_sns: "new-sns-name", lambda_sqs: "new-sqs-name" };

    inferrer.createInferredSpan(snssqsEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-sns-name");
    expect(getStartSpanServiceTag(2)).toBe("new-sqs-name");
  });

  it("remaps all eventbridge inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { lambda_eventbridge: "new-name" };

    inferrer.createInferredSpan(eventBridgeEvent, {} as any, {} as SpanContext);

    let modifiedDdbEvent = JSON.parse(JSON.stringify(eventBridgeEvent));
    modifiedDdbEvent.source = "my.different.event";
    inferrer.createInferredSpan(modifiedDdbEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("new-name");
  });

  it("remaps specific eventbridge inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { "my.event": "new-name" };

    inferrer.createInferredSpan(eventBridgeEvent, {} as any, {} as SpanContext);

    let modifiedDdbEvent = JSON.parse(JSON.stringify(eventBridgeEvent));
    modifiedDdbEvent.source = "my.different.event";
    inferrer.createInferredSpan(modifiedDdbEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("eventbridge");
  });

  it("remaps all API Gateway inferred span service names based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { lambda_api_gateway: "new-name" };

    inferrer.createInferredSpan(webSocketEvent, {} as any, {} as SpanContext);
    inferrer.createInferredSpan(apiGatewayV2, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("new-name");
  });

  it("remaps specific API Gateway inferred span service names based on DD_SERVICE_MAPPING and leaves others alone", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { "08se3mvh28": "new-name" };

    inferrer.createInferredSpan(webSocketEvent, {} as any, {} as SpanContext);
    inferrer.createInferredSpan(apiGatewayV2, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("r3pmxmplak.execute-api.us-east-2.amazonaws.com");
  });

  it("remaps all Lambda URL inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { lambda_url: "new-name" };

    inferrer.createInferredSpan(functionUrlEvent, {} as any, {} as SpanContext);
    let modifiedFunctionUrlEvent = JSON.parse(JSON.stringify(functionUrlEvent));
    modifiedFunctionUrlEvent.requestContext.domainName = "foobar.lambda-url.eu-south-1.amazonaws.com";
    inferrer.createInferredSpan(modifiedFunctionUrlEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("new-name");
  });

  it("remaps specific Lambda URL inferred span service name based on DD_SERVICE_MAPPING and leaves others alone", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { a8hyhsshac: "new-name" };

    inferrer.createInferredSpan(functionUrlEvent, {} as any, {} as SpanContext);
    let modifiedFunctionUrlEvent = JSON.parse(JSON.stringify(functionUrlEvent));
    modifiedFunctionUrlEvent.requestContext.apiId = "different";
    inferrer.createInferredSpan(modifiedFunctionUrlEvent, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("a8hyhsshac.lambda-url.eu-south-1.amazonaws.com");
  });

  it("remaps all S3 inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { lambda_s3: "new-name" };

    inferrer.createInferredSpan(s3Event, {} as any, {} as SpanContext);

    let modifiedS3Event = JSON.parse(JSON.stringify(s3Event));
    modifiedS3Event.Records[0].s3.bucket.arn = "arn:aws:s3:::different-example-bucket";
    modifiedS3Event.Records[0].s3.bucket.name = "different-example-bucket";
    inferrer.createInferredSpan(modifiedS3Event, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("new-name");
  });

  it("remaps specific S3 inferred span service name based on DD_SERVICE_MAPPING", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    (SpanInferrer as any).serviceMapping = { "example-bucket": "new-name" };

    inferrer.createInferredSpan(s3Event, {} as any, {} as SpanContext);

    let modifiedS3Event = JSON.parse(JSON.stringify(s3Event));
    modifiedS3Event.Records[0].s3.bucket.arn = "arn:aws:s3:::different-example-bucket";
    modifiedS3Event.Records[0].s3.bucket.name = "different-example-bucket";
    inferrer.createInferredSpan(modifiedS3Event, {} as any, {} as SpanContext);

    expect(getStartSpanServiceTag(1)).toBe("new-name");
    expect(getStartSpanServiceTag(2)).toBe("s3");
  });

  it("creates an inferred span for sns events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(snsEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.sns", {
      childOf: {},
      startTime: 1643039127968,
      tags: {
        _inferred_span: { synchronicity: "async", tag_source: "self" },
        event_subscription_arn: "arn:aws:sns:us-east-1:123456789012:ExampleTopic",
        message_id: "95df01b4-ee98-5cb9-9903-4c221d41eb5e",
        operation_name: "aws.sns",
        "peer.service": "mock-lambda-service",
        request_id: undefined,
        "resource.name": "ExampleTopic",
        resource_names: "ExampleTopic",
        service: "sns",
        "service.name": "sns",
        "span.type": "sns",
        subject: "example subject",
        topic_arn: "arn:aws:sns:us-east-1:123456789012:ExampleTopic",
        topicname: "ExampleTopic",
        type: "Notification",
      },
    });
  });

  it("creates an inferred span for sqs events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(sqsEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.sqs", {
      childOf: {},
      startTime: 1523232000000,
      tags: {
        _inferred_span: { synchronicity: "async", tag_source: "self" },
        event_source_arn: "arn:aws:sqs:us-east-1:123456789012:MyQueue",
        operation_name: "aws.sqs",
        "peer.service": "mock-lambda-service",
        queuename: "MyQueue",
        receipt_handle: "MessageReceiptHandle",
        request_id: undefined,
        "resource.name": "MyQueue",
        resource_names: "MyQueue",
        retry_count: 1,
        sender_id: "123456789012",
        service: "sqs",
        "service.name": "sqs",
        "span.type": "web",
      },
    });
  });

  it("creates an inferred span for ddb events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(ddbEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.dynamodb", {
      childOf: {},
      startTime: 1428537600000,
      tags: {
        _inferred_span: { synchronicity: "async", tag_source: "self" },
        tablename: "ExampleTableWithStream",
        event_id: "c4ca4238a0b923820dcc509a6f75849b",
        event_name: "INSERT",
        event_source_arn:
          "arn:aws:dynamodb:us-east-1:123456789012:table/ExampleTableWithStream/stream/2015-06-27T00:48:05.899",
        event_version: "1.1",
        operation_name: "aws.dynamodb",
        "peer.service": "mock-lambda-service",
        request_id: undefined,
        "resource.name": "INSERT ExampleTableWithStream",
        resource_names: "INSERT ExampleTableWithStream",
        service: "aws.dynamodb",
        "service.name": "aws.dynamodb",
        size_bytes: 26,
        "span.type": "web",
        stream_view_type: "NEW_AND_OLD_IMAGES",
      },
    });
  });

  it("creates an inferred span for kinesis events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(kinesisEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.kinesis", {
      childOf: {},
      startTime: 1642518727248,
      tags: {
        _inferred_span: { synchronicity: "async", tag_source: "self" },
        event_id: "shardId-000000000000:49545115243490985018280067714973144582180062593244200961",
        event_name: "aws:kinesis:record",
        event_source_arn: "arn:aws:kinesis:EXAMPLE",
        event_version: "1.0",
        operation_name: "aws.kinesis",
        "peer.service": "mock-lambda-service",
        partition_key: "cdbfd750-cec0-4f0f-a4b0-82ae6152c7fb",
        request_id: undefined,
        "resource.name": "EXAMPLE",
        resource_names: "EXAMPLE",
        service: "kinesis",
        "service.name": "kinesis",
        shardid: "49545115243490985018280067714973144582180062593244200961",
        "span.type": "web",
        streamname: "EXAMPLE",
      },
    });
  });

  it("creates an inferred span for sns sqs events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(snssqsEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan.mock.calls).toEqual([
      [
        "aws.sns",
        {
          childOf: {},
          startTime: 1639777618040,
          tags: {
            _inferred_span: { synchronicity: "async", tag_source: "self" },
            message_id: "0a0ab23e-4861-5447-82b7-e8094ff3e332",
            operation_name: "aws.sns",
            "peer.service": "mock-lambda-service",
            request_id: undefined,
            "resource.name": "js-library-test-dev-demoTopic-15WGUVRCBMPAA",
            resource_names: "js-library-test-dev-demoTopic-15WGUVRCBMPAA",
            service: "sns",
            "service.name": "sns",
            "span.type": "sns",
            subject: undefined,
            topic_arn: "arn:aws:sns:eu-west-1:601427279990:js-library-test-dev-demoTopic-15WGUVRCBMPAA",
            topicname: "js-library-test-dev-demoTopic-15WGUVRCBMPAA",
            type: "Notification",
          },
        },
      ],
      [
        "aws.sqs",
        {
          childOf: undefined,
          startTime: 1639777618130,
          tags: {
            _inferred_span: { synchronicity: "async", tag_source: "self" },
            event_source_arn: "arn:aws:sqs:eu-west-1:601427279990:aj-js-library-test-dev-demo-queue",
            operation_name: "aws.sqs",
            "peer.service": "mock-lambda-service",
            queuename: "aj-js-library-test-dev-demo-queue",
            receipt_handle:
              "AQEBER6aRkfG8092GvkL7FRwCwbQ7LLDW9Tlk/CembqHe+suS2kfFxXiukomvaIN61QoyQMoRgWuV52SDkiQno2u+5hP64BDbmw+e/KR9ayvIfHJ3M6RfyQLaWNWm3hDFBCKTnBMVIxtdx0N9epZZewyokjKcrNYtmCghFgTCvZzsQkowi5rnoHAVHJ3je1c3bDnQ1KLrZFgajDnootYXDwEPuMq5FIxrf4EzTe0S7S+rnRm+GaQfeBLBVAY6dASL9usV3/AFRqDtaI7GKI+0F2NCgLlqj49VlPRz4ldhkGknYlKTZTluAqALWLJS62/J1GQo53Cs3nneJcmu5ajB2zzmhhRXoXINEkLhCD5ujZfcsw9H4xqW69Or4ECvlqx14bUU2rtMIW0QM2p7pEeXnyocymQv6m1te113eYWTVmaJ4I=",
            request_id: undefined,
            "resource.name": "aj-js-library-test-dev-demo-queue",
            resource_names: "aj-js-library-test-dev-demo-queue",
            retry_count: 1,
            sender_id: "AIDAIOA2GYWSHW4E2VXIO",
            service: "sqs",
            "service.name": "sqs",
            "span.type": "web",
          },
        },
      ],
    ]);
  });

  it("creates an inferred span for eventbridge events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(eventBridgeEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.eventbridge", {
      childOf: {},
      startTime: 1643040010000,
      tags: {
        _inferred_span: { synchronicity: "async", tag_source: "self" },
        operation_name: "aws.eventbridge",
        "peer.service": "mock-lambda-service",
        request_id: undefined,
        "resource.name": "my.event",
        resource_names: "my.event",
        service: "eventbridge",
        "service.name": "eventbridge",
        "span.type": "web",
      },
    });
  });

  it("creates an inferred span for eventbridge sqs events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(eventBridgeSQSEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan.mock.calls).toEqual([
      [
        "aws.eventbridge",
        {
          childOf: {},
          startTime: 1691102943000,
          tags: {
            _inferred_span: { synchronicity: "async", tag_source: "self" },
            operation_name: "aws.eventbridge",
            "peer.service": "mock-lambda-service",
            request_id: undefined,
            "resource.name": "my.Source",
            resource_names: "my.Source",
            service: "eventbridge",
            "service.name": "eventbridge",
            "span.type": "web",
          },
        },
      ],
      [
        "aws.sqs",
        {
          childOf: undefined,
          startTime: 1691102943638,
          tags: {
            _inferred_span: { synchronicity: "async", tag_source: "self" },
            event_source_arn: "arn:aws:sqs:us-east-1:425362996713:lambda-eb-sqs-lambda-dev-demo-queue",
            operation_name: "aws.sqs",
            "peer.service": "mock-lambda-service",
            queuename: "lambda-eb-sqs-lambda-dev-demo-queue",
            receipt_handle:
              "AQEB4mIfRcyqtzn1X5Ss+ConhTejVGc+qnAcmu3/Z9ZvbNkaPcpuDLX/bzvPD/ZkAXJUXZcemGSJmd7L3snZHKMP2Ck8runZiyl4mubiLb444pZvdiNPuGRJ6a3FvgS/GQPzho/9nNMyOi66m8Viwh70v4EUCPGO4JmD3TTDAUrrcAnqU4WSObjfC/NAp9bI6wH2CEyAYEfex6Nxplbl/jBf9ZUG0I3m3vQd0Q4l4gd4jIR4oxQUglU2Tldl4Kx5fMUAhTRLAENri6HsY81avBkKd9FAuxONlsITB5uj02kOkvLlRGEcalqsKyPJ7AFaDLrOLaL3U+yReroPEJ5R5nwhLOEbeN5HROlZRXeaAwZOIN8BjqdeooYTIOrtvMEVb7a6OPLMdH1XB+ddevtKAH8K9Tm2ZjpaA7dtBGh1zFVHzBk=",
            request_id: undefined,
            "resource.name": "lambda-eb-sqs-lambda-dev-demo-queue",
            resource_names: "lambda-eb-sqs-lambda-dev-demo-queue",
            retry_count: 1,
            sender_id: "AIDAJXNJGGKNS7OSV23OI",
            service: "sqs",
            "service.name": "sqs",
            "span.type": "web",
          },
        },
      ],
    ]);
  });

  it("creates an inferred span for websocket events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(webSocketEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.apigateway", {
      childOf: {},
      startTime: 1642607783913,
      tags: {
        _inferred_span: { synchronicity: "sync", tag_source: "self" },
        apiid: "08se3mvh28",
        connection_id: "MM0qReAFGjQCE-w=",
        endpoint: "$connect",
        event_type: "CONNECT",
        "http.url": "https://08se3mvh28.execute-api.eu-west-1.amazonaws.com$connect",
        message_direction: "IN",
        operation_name: "aws.apigateway",
        "peer.service": "mock-lambda-service",
        request_id: undefined,
        "resource.name": "08se3mvh28.execute-api.eu-west-1.amazonaws.com $connect",
        resource_names: "08se3mvh28.execute-api.eu-west-1.amazonaws.com $connect",
        service: "08se3mvh28.execute-api.eu-west-1.amazonaws.com",
        "service.name": "08se3mvh28.execute-api.eu-west-1.amazonaws.com",
        "span.type": "http",
      },
    });
  });

  it("creates an inferred span for API Gateway V1 events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayV1, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.apigateway", {
      childOf: {},
      startTime: 1583349317135,
      tags: {
        _inferred_span: { synchronicity: "sync", tag_source: "self" },
        apiid: "id",
        endpoint: "/my/path",
        "http.url": "https://id.execute-api.us-east-1.amazonaws.com/my/path",
        domain_name: "id.execute-api.us-east-1.amazonaws.com",
        operation_name: "aws.apigateway",
        "peer.service": "mock-lambda-service",
        request_id: undefined,
        "http.method": "GET",
        "resource.name": "GET /path",
        resource_names: "GET /path",
        service: "id.execute-api.us-east-1.amazonaws.com",
        "service.name": "id.execute-api.us-east-1.amazonaws.com",
        "span.type": "http",
        stage: "$default",
      },
    });
  });

  it("creates an inferred span for API Gateway V2 events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayV2, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.apigateway", {
      childOf: {},
      startTime: 1583817383220,
      tags: {
        _inferred_span: { synchronicity: "sync", tag_source: "self" },
        apiid: "r3pmxmplak",
        endpoint: "/default/nodejs-apig-function-1G3XMPLZXVXYI",
        "http.url": "https://r3pmxmplak.execute-api.us-east-2.amazonaws.com/default/nodejs-apig-function-1G3XMPLZXVXYI",
        domain_name: "r3pmxmplak.execute-api.us-east-2.amazonaws.com",
        operation_name: "aws.apigateway",
        "peer.service": "mock-lambda-service",
        request_id: undefined,
        "http.method": "GET",
        "resource.name": "GET /default/nodejs-apig-function-1G3XMPLZXVXYI",
        resource_names: "GET /default/nodejs-apig-function-1G3XMPLZXVXYI",
        service: "r3pmxmplak.execute-api.us-east-2.amazonaws.com",
        "service.name": "r3pmxmplak.execute-api.us-east-2.amazonaws.com",
        "span.type": "http",
        stage: "default",
      },
    });
  });

  it("creates an inferred span for API Gateway V1 events with parameters", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayV1Parametrized, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.apigateway", {
      childOf: {},
      startTime: 1710529824520,
      tags: {
        _inferred_span: { synchronicity: "sync", tag_source: "self" },
        apiid: "mcwkra0ya4",
        endpoint: "/dev/user/42",
        "http.url": "https://mcwkra0ya4.execute-api.sa-east-1.amazonaws.com/dev/user/42",
        domain_name: "mcwkra0ya4.execute-api.sa-east-1.amazonaws.com",
        operation_name: "aws.apigateway",
        "peer.service": "mock-lambda-service",
        request_id: undefined,
        "http.method": "GET",
        "resource.name": "GET /user/{id}",
        resource_names: "GET /user/{id}",
        service: "mcwkra0ya4.execute-api.sa-east-1.amazonaws.com",
        "service.name": "mcwkra0ya4.execute-api.sa-east-1.amazonaws.com",
        "span.type": "http",
        stage: "dev",
      },
    });
  });

  it("creates an inferred span for API Gateway V2 events with parameters", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayV2Parametrized, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.apigateway", {
      childOf: {},
      startTime: 1710529905066,
      tags: {
        _inferred_span: { synchronicity: "sync", tag_source: "self" },
        apiid: "9vj54we5ih",
        endpoint: "/user/42",
        "http.url": "https://9vj54we5ih.execute-api.sa-east-1.amazonaws.com/user/42",
        domain_name: "9vj54we5ih.execute-api.sa-east-1.amazonaws.com",
        operation_name: "aws.apigateway",
        "peer.service": "mock-lambda-service",
        request_id: undefined,
        "http.method": "GET",
        "resource.name": "GET /user/{id}",
        resource_names: "GET /user/{id}",
        service: "9vj54we5ih.execute-api.sa-east-1.amazonaws.com",
        "service.name": "9vj54we5ih.execute-api.sa-east-1.amazonaws.com",
        "span.type": "http",
        stage: "$default",
      },
    });
  });

  it("creates an inferred span for Lambda Function URL Events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(functionUrlEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.lambda.url", {
      childOf: {},
      startTime: 1637169449721,
      tags: {
        _inferred_span: {
          synchronicity: "sync",
          tag_source: "self",
        },
        endpoint: "/",
        "http.method": "GET",
        "http.url": "https://a8hyhsshac.lambda-url.eu-south-1.amazonaws.com/",
        operation_name: "aws.lambda.url",
        "peer.service": "mock-lambda-service",
        request_id: undefined,
        "resource.name": "GET /",
        resource_names: "GET /",
        service: "a8hyhsshac.lambda-url.eu-south-1.amazonaws.com",
        "service.name": "a8hyhsshac.lambda-url.eu-south-1.amazonaws.com",
        "span.type": "http",
      },
    });
  });

  it("creates an inferred span for s3 events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(s3Event, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.s3", {
      childOf: {},
      startTime: 0,
      tags: {
        _inferred_span: { synchronicity: "async", tag_source: "self" },
        bucket_arn: "arn:aws:s3:::example-bucket",
        bucketname: "example-bucket",
        event_name: "ObjectCreated:Put",
        object_etag: "0123456789abcdef0123456789abcdef",
        object_key: "test/key",
        object_size: 1024,
        operation_name: "aws.s3",
        "peer.service": "mock-lambda-service",
        request_id: undefined,
        "resource.name": "example-bucket",
        resource_names: "example-bucket",
        service: "s3",
        "service.name": "s3",
        "span.type": "web",
      },
    });
  });
});

const mockFinish = () => undefined;

describe("Authorizer Spans", () => {
  const mockWrapperWithFinish = {
    startSpan: jest.fn(() => {
      return {
        finish: mockFinish,
      };
    }),
  };
  let oldEnv: any;

  beforeEach(() => {
    mockWrapperWithFinish.startSpan = jest.fn(() => {
      return {
        finish: mockFinish,
      };
    });

    oldEnv = process.env;
    process.env = {
      [DD_SERVICE_ENV_VAR]: "mock-lambda-service",
    };
  });

  afterEach(() => {
    mockWrapperWithFinish.startSpan.mockReset();
    process.env = oldEnv;
  });

  it("creates an inferred span for API Gateway V1 event with traced authorizers [Request Type]", () => {
    const inferrer = new SpanInferrer(mockWrapperWithFinish as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayV1RequestAuthorizer, {} as any, {} as SpanContext);
    expect(mockWrapperWithFinish.startSpan.mock.calls[0]).toEqual([
      "aws.apigateway.authorizer",
      {
        childOf: {},
        startTime: 1660939857052,
        tags: {
          _inferred_span: { synchronicity: "sync", tag_source: "self" },
          apiid: "3gsxz7lha4",
          domain_name: "3gsxz7lha4.execute-api.eu-west-1.amazonaws.com",
          endpoint: "/dev/hello",
          "http.method": "POST",
          "http.url": "https://3gsxz7lha4.execute-api.eu-west-1.amazonaws.com/dev/hello",
          operation_name: "aws.apigateway",
          "peer.service": "mock-lambda-service",
          request_id: undefined,
          "resource.name": "POST /hello",
          resource_names: "POST /hello",
          service: "3gsxz7lha4.execute-api.eu-west-1.amazonaws.com",
          "service.name": "3gsxz7lha4.execute-api.eu-west-1.amazonaws.com",
          "span.type": "http",
          stage: "dev",
        },
      },
    ]);
    expect(mockWrapperWithFinish.startSpan.mock.calls[1]).toEqual([
      "aws.apigateway",
      {
        childOf: { finish: mockFinish }, // Hack around jest mocks
        startTime: 1660939857075,
        tags: {
          _inferred_span: { synchronicity: "sync", tag_source: "self" },
          apiid: "3gsxz7lha4",
          domain_name: "3gsxz7lha4.execute-api.eu-west-1.amazonaws.com",
          endpoint: "/dev/hello",
          "http.method": "POST",
          "http.url": "https://3gsxz7lha4.execute-api.eu-west-1.amazonaws.com/dev/hello",
          operation_name: "aws.apigateway",
          "peer.service": "mock-lambda-service",
          request_id: undefined,
          "resource.name": "POST /hello",
          resource_names: "POST /hello",
          service: "3gsxz7lha4.execute-api.eu-west-1.amazonaws.com",
          "service.name": "3gsxz7lha4.execute-api.eu-west-1.amazonaws.com",
          "span.type": "http",
          stage: "dev",
        },
      },
    ]);
  });

  it("No inferred span for API Gateway V1 event with CACHED authorizers [Request Type]", () => {
    const inferrer = new SpanInferrer(mockWrapperWithFinish as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayV1RequestAuthorizerCached, {} as any, {} as SpanContext);
    expect(mockWrapperWithFinish.startSpan.mock.calls[0]).toEqual([
      "aws.apigateway",
      {
        childOf: {}, // Hack around jest mocks
        startTime: 1660939855656,
        tags: {
          _inferred_span: { synchronicity: "sync", tag_source: "self" },
          apiid: "3gsxz7lha4",
          domain_name: "3gsxz7lha4.execute-api.eu-west-1.amazonaws.com",
          endpoint: "/dev/hello",
          "http.method": "POST",
          "http.url": "https://3gsxz7lha4.execute-api.eu-west-1.amazonaws.com/dev/hello",
          operation_name: "aws.apigateway",
          "peer.service": "mock-lambda-service",
          request_id: undefined,
          "resource.name": "POST /hello",
          resource_names: "POST /hello",
          service: "3gsxz7lha4.execute-api.eu-west-1.amazonaws.com",
          "service.name": "3gsxz7lha4.execute-api.eu-west-1.amazonaws.com",
          "span.type": "http",
          stage: "dev",
        },
      },
    ]);
  });

  it("creates an inferred span for API Gateway V1 event with traced authorizers [Token Type]", () => {
    const inferrer = new SpanInferrer(mockWrapperWithFinish as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayV1TokenAuthorizer, {} as any, {} as SpanContext);
    expect(mockWrapperWithFinish.startSpan.mock.calls[0]).toEqual([
      "aws.apigateway.authorizer",
      {
        childOf: {},
        startTime: 1666803196780,
        tags: {
          _inferred_span: { synchronicity: "sync", tag_source: "self" },
          apiid: "4dyr9xqip7",
          domain_name: "4dyr9xqip7.execute-api.eu-west-1.amazonaws.com",
          endpoint: "/dev/hi",
          "http.method": "GET",
          "http.url": "https://4dyr9xqip7.execute-api.eu-west-1.amazonaws.com/dev/hi",
          operation_name: "aws.apigateway",
          "peer.service": "mock-lambda-service",
          request_id: undefined,
          "resource.name": "GET /hi",
          resource_names: "GET /hi",
          service: "4dyr9xqip7.execute-api.eu-west-1.amazonaws.com",
          "service.name": "4dyr9xqip7.execute-api.eu-west-1.amazonaws.com",
          "span.type": "http",
          stage: "dev",
        },
      },
    ]);
    expect(mockWrapperWithFinish.startSpan.mock.calls[1]).toEqual([
      "aws.apigateway",
      {
        childOf: { finish: mockFinish }, // Hack around jest mocks
        startTime: 1666803196783,
        tags: {
          _inferred_span: { synchronicity: "sync", tag_source: "self" },
          apiid: "4dyr9xqip7",
          domain_name: "4dyr9xqip7.execute-api.eu-west-1.amazonaws.com",
          endpoint: "/dev/hi",
          "http.method": "GET",
          "http.url": "https://4dyr9xqip7.execute-api.eu-west-1.amazonaws.com/dev/hi",
          operation_name: "aws.apigateway",
          "peer.service": "mock-lambda-service",
          request_id: undefined,
          "resource.name": "GET /hi",
          resource_names: "GET /hi",
          service: "4dyr9xqip7.execute-api.eu-west-1.amazonaws.com",
          "service.name": "4dyr9xqip7.execute-api.eu-west-1.amazonaws.com",
          "span.type": "http",
          stage: "dev",
        },
      },
    ]);
  });

  it("No inferred span for API Gateway V1 event with CACHED authorizers [Token Type]", () => {
    const inferrer = new SpanInferrer(mockWrapperWithFinish as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayV1TokenAuthorizerCached, {} as any, {} as SpanContext);
    expect(mockWrapperWithFinish.startSpan.mock.calls[0]).toEqual([
      "aws.apigateway",
      {
        childOf: {}, // Hack around jest mocks
        startTime: 1666803234094,
        tags: {
          _inferred_span: { synchronicity: "sync", tag_source: "self" },
          apiid: "4dyr9xqip7",
          domain_name: "4dyr9xqip7.execute-api.eu-west-1.amazonaws.com",
          endpoint: "/dev/hi",
          "http.method": "GET",
          "http.url": "https://4dyr9xqip7.execute-api.eu-west-1.amazonaws.com/dev/hi",
          operation_name: "aws.apigateway",
          "peer.service": "mock-lambda-service",
          request_id: undefined,
          "resource.name": "GET /hi",
          resource_names: "GET /hi",
          service: "4dyr9xqip7.execute-api.eu-west-1.amazonaws.com",
          "service.name": "4dyr9xqip7.execute-api.eu-west-1.amazonaws.com",
          "span.type": "http",
          stage: "dev",
        },
      },
    ]);
  });

  it("connects the inferred span for API Gateway V2 event with traced authorizers [Request Type]", () => {
    const inferrer = new SpanInferrer(mockWrapperWithFinish as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayV2RequestAuthorizer, {} as any, {} as SpanContext);
    expect(mockWrapperWithFinish.startSpan.mock.calls[0]).toEqual([
      "aws.apigateway",
      {
        childOf: {},
        startTime: 1665596771812,
        tags: {
          _inferred_span: { synchronicity: "sync", tag_source: "self" },
          apiid: "l9flvsey83",
          domain_name: "l9flvsey83.execute-api.eu-west-1.amazonaws.com",
          endpoint: "/hello",
          "http.method": "GET",
          "http.url": "https://l9flvsey83.execute-api.eu-west-1.amazonaws.com/hello",
          operation_name: "aws.httpapi",
          "peer.service": "mock-lambda-service",
          request_id: undefined,
          "resource.name": "GET /hello",
          resource_names: "GET /hello",
          service: "l9flvsey83.execute-api.eu-west-1.amazonaws.com",
          "service.name": "l9flvsey83.execute-api.eu-west-1.amazonaws.com",
          "span.type": "http",
          stage: "$default",
        },
      },
    ]);
  });

  it("No inferred span for API Gateway V2 event with CACHED authorizers [Request Type]", () => {
    const inferrer = new SpanInferrer(mockWrapperWithFinish as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayV2TokenAuthorizerCached, {} as any, {} as SpanContext);
    expect(mockWrapperWithFinish.startSpan.mock.calls[0]).toEqual([
      "aws.apigateway",
      {
        childOf: {},
        startTime: 1665596856876,
        tags: {
          _inferred_span: { synchronicity: "sync", tag_source: "self" },
          apiid: "l9flvsey83",
          domain_name: "l9flvsey83.execute-api.eu-west-1.amazonaws.com",
          endpoint: "/hello",
          "http.method": "GET",
          "http.url": "https://l9flvsey83.execute-api.eu-west-1.amazonaws.com/hello",
          operation_name: "aws.apigateway",
          "peer.service": "mock-lambda-service",
          request_id: undefined,
          "resource.name": "GET /hello",
          resource_names: "GET /hello",
          service: "l9flvsey83.execute-api.eu-west-1.amazonaws.com",
          "service.name": "l9flvsey83.execute-api.eu-west-1.amazonaws.com",
          "span.type": "http",
          stage: "$default",
        },
      },
    ]);
  });

  it("creates an inferred span for API Gateway Websocket Connect event with traced authorizers [Request Type]", () => {
    const inferrer = new SpanInferrer(mockWrapperWithFinish as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayWSSRequestAuthorizerConnect, {} as any, {} as SpanContext);
    expect(mockWrapperWithFinish.startSpan.mock.calls[0]).toEqual([
      "aws.apigateway.authorizer",
      {
        childOf: {},
        startTime: 1666633566931,
        tags: {
          _inferred_span: { synchronicity: "sync", tag_source: "self" },
          apiid: "85fj5nw29d",
          connection_id: "ahVWscZqmjQCI1w=",
          endpoint: "$connect",
          event_type: "CONNECT",
          "http.url": "https://85fj5nw29d.execute-api.eu-west-1.amazonaws.com$connect",
          message_direction: "IN",
          operation_name: "aws.apigateway",
          "peer.service": "mock-lambda-service",
          request_id: undefined,
          "resource.name": "85fj5nw29d.execute-api.eu-west-1.amazonaws.com $connect",
          resource_names: "85fj5nw29d.execute-api.eu-west-1.amazonaws.com $connect",
          service: "85fj5nw29d.execute-api.eu-west-1.amazonaws.com",
          "service.name": "85fj5nw29d.execute-api.eu-west-1.amazonaws.com",
          "span.type": "http",
        },
      },
    ]);
    expect(mockWrapperWithFinish.startSpan.mock.calls[1]).toEqual([
      "aws.apigateway",
      {
        childOf: { finish: mockFinish }, // Hack around jest mocks
        startTime: 1666633566947,
        tags: {
          _inferred_span: { synchronicity: "sync", tag_source: "self" },
          apiid: "85fj5nw29d",
          connection_id: "ahVWscZqmjQCI1w=",
          endpoint: "$connect",
          event_type: "CONNECT",
          "http.url": "https://85fj5nw29d.execute-api.eu-west-1.amazonaws.com$connect",
          message_direction: "IN",
          operation_name: "aws.apigateway",
          "peer.service": "mock-lambda-service",
          request_id: undefined,
          "resource.name": "85fj5nw29d.execute-api.eu-west-1.amazonaws.com $connect",
          resource_names: "85fj5nw29d.execute-api.eu-west-1.amazonaws.com $connect",
          service: "85fj5nw29d.execute-api.eu-west-1.amazonaws.com",
          "service.name": "85fj5nw29d.execute-api.eu-west-1.amazonaws.com",
          "span.type": "http",
        },
      },
    ]);
  });

  it("No inferred span for API Gateway Websocket Message event with traced authorizers [Request Type]", () => {
    const inferrer = new SpanInferrer(mockWrapperWithFinish as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayWSSRequestAuthorizerMessage, {} as any, {} as SpanContext);
    expect(mockWrapperWithFinish.startSpan.mock.calls[0]).toEqual([
      "aws.apigateway",
      {
        childOf: {},
        startTime: 1666633666203,
        tags: {
          _inferred_span: { synchronicity: "sync", tag_source: "self" },
          apiid: "85fj5nw29d",
          connection_id: "ahVWscZqmjQCI1w=",
          endpoint: "hello",
          event_type: "MESSAGE",
          "http.url": "https://85fj5nw29d.execute-api.eu-west-1.amazonaws.comhello",
          message_direction: "IN",
          operation_name: "aws.apigateway",
          "peer.service": "mock-lambda-service",
          request_id: undefined,
          "resource.name": "85fj5nw29d.execute-api.eu-west-1.amazonaws.com hello",
          resource_names: "85fj5nw29d.execute-api.eu-west-1.amazonaws.com hello",
          service: "85fj5nw29d.execute-api.eu-west-1.amazonaws.com",
          "service.name": "85fj5nw29d.execute-api.eu-west-1.amazonaws.com",
          "span.type": "http",
        },
      },
    ]);
  });
});
