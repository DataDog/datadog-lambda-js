import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { SQSEventTraceExtractor } from "./sqs";

let mockSpanContext: any = null;

// Mocking extract is needed, due to dd-trace being a No-op
// if the detected environment is testing. This is expected, since
// we don't want to test dd-trace extraction, but our components.
const ddTrace = require("dd-trace");
jest.mock("dd-trace", () => {
  return {
    ...ddTrace,
    _tracer: { _service: {} },
    extract: (_carrier: any, _headers: any) => mockSpanContext,
  };
});
const spyTracerWrapper = jest.spyOn(TracerWrapper.prototype, "extract");

describe("SQSEventTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
    });

    afterEach(() => {
      jest.resetModules();
    });

    it("extracts trace context with valid payload", () => {
      mockSpanContext = {
        toTraceId: () => "4555236104497098341",
        toSpanId: () => "3369753143434738315",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload: SQSEvent = {
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
      };

      const extractor = new SQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-parent-id": "3369753143434738315",
        "x-datadog-sampled": "1",
        "x-datadog-sampling-priority": "1",
        "x-datadog-trace-id": "4555236104497098341",
      });

      expect(traceContext?.toTraceId()).toBe("4555236104497098341");
      expect(traceContext?.toSpanId()).toBe("3369753143434738315");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it.each([
      ["Records", {}],
      ["Records first entry", { Records: [] }],
      ["messageAttributes in first entry", { Records: [{ messageAttributes: "{}" }] }],
      ["_datadog in messageAttributes", { Records: [{ messageAttributes: {} }] }],
      ["stringValue in _datadog", { Records: [{ messageAttributes: { _datadog: {} } }] }],
    ])("returns null and skips extracting when payload is missing '%s'", (_, payload) => {
      const tracerWrapper = new TracerWrapper();
      const extractor = new SQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload as any);
      expect(traceContext).toBeNull();
    });

    it("returns null when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper();

      const payload: SQSEvent = {
        Records: [
          {
            messageId: "19dd0b57-b21e-4ac1-bd88-01bbb068cb78",
            receiptHandle: "MessageReceiptHandle",
            body: "Hello from SQS!",
            attributes: {
              ApproximateReceiveCount: "1",
              SentTimestamp: "1523232000000",
              SenderId: "123456789012",
              ApproximateFirstReceiveTimestamp: "1523232000001",
            },
            messageAttributes: {},
            md5OfBody: "{{{md5_of_body}}}",
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:MyQueue",
            awsRegion: "us-east-1",
          },
        ],
      };
      const extractor = new SQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).toBeNull();
    });
  });
});
