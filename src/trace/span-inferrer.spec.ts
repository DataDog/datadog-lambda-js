import { SpanInferrer } from "./span-inferrer";
import { SpanContext, TracerWrapper } from "./tracer-wrapper";
const lambdaURLEvent = require("../../event_samples/lambda-function-urls.json");

const mockWrapper = {
  startSpan: jest.fn(),
};

describe("SpanInferrer", () => {
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
});
