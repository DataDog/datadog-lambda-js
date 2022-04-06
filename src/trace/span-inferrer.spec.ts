import { SpanInferrer } from "./span-inferrer";
import { SpanContext, TracerWrapper } from "./tracer-wrapper";
const snssqsEvent = require("../../event_samples/snssqs.json");
const snsEvent = require("../../event_samples/sns.json");
const sqsEvent = require("../../event_samples/sqs.json");
const ddbEvent = require("../../event_samples/dynamodb.json");
const kinesisEvent = require("../../event_samples/kinesis.json");
const eventBridgeEvent = require("../../event_samples/eventbridge.json");
const webSocketEvent = require("../../event_samples/api-gateway-wss.json");
const apiGatewayV1 = require("../../event_samples/api-gateway-v1.json");
const apiGatewayV2 = require("../../event_samples/api-gateway-v2.json");
const s3Event = require("../../event_samples/s3.json");
const functionUrlEvent = require("../../event_samples/lambda-function-urls.json");
const mockWrapper = {
  startSpan: jest.fn(),
};

describe("SpanInferrer", () => {
  beforeEach(() => {
    mockWrapper.startSpan.mockClear();
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
        request_id: undefined,
        "resource.name": "ExampleTopic",
        resource_names: "ExampleTopic",
        service: "sns",
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
        queuename: "MyQueue",
        receipt_handle: "MessageReceiptHandle",
        request_id: undefined,
        "resource.name": "MyQueue",
        resource_names: "MyQueue",
        retry_count: 1,
        sender_id: "123456789012",
        service: "sqs",
        "service.name": "MyQueue",
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
        request_id: undefined,
        "resource.name": "INSERT ExampleTableWithStream",
        resource_names: "INSERT ExampleTableWithStream",
        service: "aws.dynamodb",
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
        partition_key: "cdbfd750-cec0-4f0f-a4b0-82ae6152c7fb",
        request_id: undefined,
        "resource.name": "EXAMPLE",
        resource_names: "EXAMPLE",
        service: "kinesis",
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
            "resource.name": "js-library-test-dev-demoTopic-15WGUVRCBMPAA",
            resource_names: "js-library-test-dev-demoTopic-15WGUVRCBMPAA",
            service: "sns",
            "span.type": "sns",
            subject: undefined,
            topic_arn: "arn:aws:sns:sa-east-1:601427279990:js-library-test-dev-demoTopic-15WGUVRCBMPAA",
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
            event_source_arn: "arn:aws:sqs:sa-east-1:601427279990:aj-js-library-test-dev-demo-queue",
            operation_name: "aws.sqs",
            queuename: "aj-js-library-test-dev-demo-queue",
            receipt_handle:
              "AQEBER6aRkfG8092GvkL7FRwCwbQ7LLDW9Tlk/CembqHe+suS2kfFxXiukomvaIN61QoyQMoRgWuV52SDkiQno2u+5hP64BDbmw+e/KR9ayvIfHJ3M6RfyQLaWNWm3hDFBCKTnBMVIxtdx0N9epZZewyokjKcrNYtmCghFgTCvZzsQkowi5rnoHAVHJ3je1c3bDnQ1KLrZFgajDnootYXDwEPuMq5FIxrf4EzTe0S7S+rnRm+GaQfeBLBVAY6dASL9usV3/AFRqDtaI7GKI+0F2NCgLlqj49VlPRz4ldhkGknYlKTZTluAqALWLJS62/J1GQo53Cs3nneJcmu5ajB2zzmhhRXoXINEkLhCD5ujZfcsw9H4xqW69Or4ECvlqx14bUU2rtMIW0QM2p7pEeXnyocymQv6m1te113eYWTVmaJ4I=",
            request_id: undefined,
            "resource.name": "aj-js-library-test-dev-demo-queue",
            resource_names: "aj-js-library-test-dev-demo-queue",
            retry_count: 1,
            sender_id: "AIDAIOA2GYWSHW4E2VXIO",
            service: "sqs",
            "service.name": "aj-js-library-test-dev-demo-queue",
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
        request_id: undefined,
        "resource.name": "my.event",
        resource_names: "my.event",
        service: "eventbridge",
        "span.type": "web",
      },
    });
  });

  it("creates an inferred span for websocket events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(webSocketEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.apigateway", {
      childOf: {},
      startTime: undefined,
      tags: {
        _inferred_span: { synchronicity: "sync", tag_source: "self" },
        apiid: "08se3mvh28",
        connection_id: "MM0qReAFGjQCE-w=",
        endpoint: "$connect",
        event_type: "CONNECT",
        "http.url": "08se3mvh28.execute-api.sa-east-1.amazonaws.com$connect",
        message_direction: "IN",
        operation_name: "aws.apigateway",
        request_id: undefined,
        "resource.name": "08se3mvh28.execute-api.sa-east-1.amazonaws.com $connect",
        resource_names: "08se3mvh28.execute-api.sa-east-1.amazonaws.com $connect",
        service: "08se3mvh28.execute-api.sa-east-1.amazonaws.com",
        "service.name": "08se3mvh28.execute-api.sa-east-1.amazonaws.com",
        "span.type": "http",
      },
    });
  });

  it("creates an inferred span for API Gateway V1 events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(apiGatewayV1, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.apigateway", {
      childOf: {},
      startTime: undefined,
      tags: {
        _inferred_span: { synchronicity: "sync", tag_source: "self" },
        apiid: "id",
        endpoint: "/my/path",
        "http.url": "id.execute-api.us-east-1.amazonaws.com/my/path",
        domain_name: "id.execute-api.us-east-1.amazonaws.com",
        operation_name: "aws.apigateway",
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
        "http.url": "r3pmxmplak.execute-api.us-east-2.amazonaws.com/default/nodejs-apig-function-1G3XMPLZXVXYI",
        domain_name: "r3pmxmplak.execute-api.us-east-2.amazonaws.com",
        operation_name: "aws.apigateway",
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

  it("creates an inferred span for Lambda Function URL Events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(functionUrlEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.lambda.url", {
      startTime: 1637169449721,
      tags: {
        _inferred_span: {
          synchronicity: "sync",
          tag_source: "self",
        },
        endpoint: "/",
        "http.method": "GET",
        "http.url": "a8hyhsshac.lambda-url.eu-south-1.amazonaws.com/",
        operation_name: "aws.lambda.url",
        request_id: undefined,
        "resource.name": "GET /",
        resource_names: "GET /",
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
        request_id: undefined,
        "resource.name": "example-bucket",
        resource_names: "example-bucket",
        service: "s3",
        "span.type": "web",
      },
    });
  });
});
