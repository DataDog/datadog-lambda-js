import { SQSEvent } from "aws-lambda";
import { readTraceFromSQSEvent } from "./sqs";
import { SampleMode, Source } from "../extractor";

describe("readTraceFromSQSEvent", () => {
  it("can read from sqs source", () => {
    const result = readTraceFromSQSEvent({
      Records: [
        {
          body: "Hello world",
          attributes: {
            ApproximateReceiveCount: "1",
            SentTimestamp: "1605544528092",
            SenderId: "AROAYYB64AB3JHSRKO6XR:sqs-trace-dev-producer",
            ApproximateFirstReceiveTimestamp: "1605544528094",
          },
          messageAttributes: {
            _datadog: {
              stringValue:
                '{"x-datadog-trace-id":"4555236104497098341","x-datadog-parent-id":"3369753143434738315","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
              stringListValues: undefined,
              binaryListValues: undefined,
              dataType: "String",
            },
          },
          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:eu-west-1:601427279990:metal-queue",
          awsRegion: "eu-west-1",
          messageId: "foo",
          md5OfBody: "x",
          receiptHandle: "x",
        },
      ],
    } as unknown as SQSEvent);
    expect(result).toEqual({
      parentID: "3369753143434738315",
      sampleMode: SampleMode.AUTO_KEEP,
      traceID: "4555236104497098341",
      source: Source.Event,
    });
  });
  it("can handle malformed JSON", () => {
    const result = readTraceFromSQSEvent({
      Records: [
        {
          body: "Hello world",
          attributes: {
            ApproximateReceiveCount: "1",
            SentTimestamp: "1605544528092",
            SenderId: "AROAYYB64AB3JHSRKO6XR:sqs-trace-dev-producer",
            ApproximateFirstReceiveTimestamp: "1605544528094",
          },
          messageAttributes: {
            _datadog: {
              stringValue:
                '{asdasdasd"x-datadog-trace-id":"4555236104497098341","x-datadog-parent-id":"3369753143434738315","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
              stringListValues: undefined,
              binaryListValues: undefined,
              dataType: "String",
            },
          },
          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:eu-west-1:601427279990:metal-queue",
          awsRegion: "eu-west-1",
          messageId: "foo",
          md5OfBody: "x",
          receiptHandle: "x",
        },
      ],
    } as unknown as SQSEvent);
    expect(result).toBeUndefined();
  });
});
