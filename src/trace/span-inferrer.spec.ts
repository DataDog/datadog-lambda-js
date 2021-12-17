import { SpanInferrer } from "./span-inferrer";
import { SpanContext, TracerWrapper } from "./tracer-wrapper";
const lambdaURLEvent = require("../../event_samples/lambda-function-urls.json");
const snssqsEvent = require("../../event_samples/snssqs.json");
const snsEvent = require("../../event_samples/sns.json");
const sqsEvent = require("../../event_samples/sqs.json");
const ddbEvent = require("../../event_samples/dynamodb.json");
const kinesisEvent = require("../../event_samples/kinesis.json");
const mockWrapper = {
  startSpan: jest.fn(),
};

describe("SpanInferrer", () => {
  beforeEach(() => {
    mockWrapper.startSpan.mockClear();
  });

  it("creates an inferred span for lambda function URLs", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(
      lambdaURLEvent,
      {
        awsRequestId: "abcd-1234",
      } as any,
      {} as SpanContext,
    );

    expect(mockWrapper.startSpan).toBeCalledWith("aws.lambda.url", {
      startTime: 1637169449721,
      childOf: {},
      tags: {
        _inferred_span: {
          synchronicity: "sync",
          tag_source: "self",
        },
        endpoint: "/",
        "http.method": "GET",
        "http.url": "a8hyhsshac.lambda-url.eu-south-1.amazonaws.com/",
        operation_name: "aws.lambda.url",
        request_id: "abcd-1234",
        "resource.name": "GET /",
        resource_names: "GET /",
        service: "a8hyhsshac.lambda-url.eu-south-1.amazonaws.com",
        "service.name": "a8hyhsshac.lambda-url.eu-south-1.amazonaws.com",
        "span.type": "http",
      },
    });
  });

  it("creates an inferred span for sns events", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(snsEvent, {} as any, {} as SpanContext);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.sns", {
      childOf: {},
      startTime: 0,
      tags: {
        _inferred_span: { synchronicity: "async", tag_source: "self" },
        operation_name: "aws.sns",
        "resource.name": "ExampleTopic",
        resource_names: "ExampleTopic",
        service: "sns",
        "span.type": "sns",
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
        operation_name: "aws.sqs",
        "resource.name": "MyQueue",
        resource_names: "MyQueue",
        retry_count: 1,
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
        "aws.dynamodb.table_name": "ExampleTableWithStream",
        operation_name: "aws.dynamodb",
        request_id: undefined,
        "resource.name": "INSERT ExampleTableWithStream",
        resource_names: "INSERT ExampleTableWithStream",
        service: "aws.dynamodb",
        "span.type": "web",
      },
    });
  });

  // it("creates an inferred span for kinesis events", () => {
  //   const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
  //   inferrer.createInferredSpan(kinesisEvent, {} as any, {} as SpanContext);

  //   expect(mockWrapper.startSpan).toBeCalledWith("aws.kinesis");
  // });

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
            operation_name: "aws.sns",
            "resource.name": "js-library-test-dev-demoTopic-15WGUVRCBMPAA",
            resource_names: "js-library-test-dev-demoTopic-15WGUVRCBMPAA",
            service: "sns",
            "span.type": "sns",
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
            operation_name: "aws.sqs",
            request_id: undefined,
            "resource.name": "aj-js-library-test-dev-demo-queue",
            resource_names: "aj-js-library-test-dev-demo-queue",
            retry_count: 1,
            service: "sqs",
            "service.name": "aj-js-library-test-dev-demo-queue",
            "span.type": "web",
          },
        },
      ],
    ]);
  });
});
