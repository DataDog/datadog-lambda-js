import { SpanInferrer } from "./span-inferrer";
import { SpanContext, TracerWrapper } from "./tracer-wrapper";
const lambdaURLEvent = require("../../event_samples/lambda-function-urls.json");
const snssqsEvent = require("../../event_samples/snssqs.json");
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
