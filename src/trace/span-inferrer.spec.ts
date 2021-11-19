import { SpanInferrer } from "./span-inferrer";
import { TracerWrapper } from "./tracer-wrapper";
const lambdaURLEvent = require("../../event_samples/lambda-function-urls.json");

const mockWrapper = {
  startSpan: jest.fn(),
};

describe("SpanInferrer", () => {
  it("creates an inferred span for lambda function URLs", () => {
    const inferrer = new SpanInferrer(mockWrapper as unknown as TracerWrapper);
    inferrer.createInferredSpan(lambdaURLEvent, {
      awsRequestId: "abcd-1234",
    } as any);

    expect(mockWrapper.startSpan).toBeCalledWith("aws.lambda.url", {
      service: "aws.lambda",
      startTime: 1637169449721,
      tags: {
        endpoint: "/",
        "http.method": "GET",
        "http.url": "a8hyhsshac.lambda-url.eu-south-1.amazonaws.com/",
        operation_name: "aws.lambda.url",
        request_id: "abcd-1234",
        "resource.name": "a8hyhsshac.lambda-url.eu-south-1.amazonaws.com/",
        resource_names: "a8hyhsshac.lambda-url.eu-south-1.amazonaws.com/",
        "span.type": "http",
      },
    });
  });
});
