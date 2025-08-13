import { SQSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { SQSEventTraceExtractor } from "./sqs";
import { StepFunctionContextService } from "../../step-function-service";

let mockSpanContext: any = null;
let mockDataStreamsCheckpointer: any = {
  setConsumeCheckpoint: jest.fn(),
};

jest.mock("dd-trace/packages/dd-trace/src/datastreams/checkpointer", () => {
  return {
    DataStreamsCheckpointer: jest.fn().mockImplementation(() => mockDataStreamsCheckpointer),
  };
});

// Mocking extract is needed, due to dd-trace being a No-op
// if the detected environment is testing. This is expected, since
// we don't want to test dd-trace extraction, but our components.
const ddTrace = require("dd-trace");
jest.mock("dd-trace", () => {
  return {
    ...ddTrace,
    _tracer: { _service: {} },
    extract: (_carrier: any, _headers: any) => mockSpanContext,
    dataStreamsCheckpointer: mockDataStreamsCheckpointer,
  };
});
const spyTracerWrapper = jest.spyOn(TracerWrapper.prototype, "extract");

describe("SQSEventTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
      spyTracerWrapper.mockClear();
      mockDataStreamsCheckpointer.setConsumeCheckpoint.mockClear();
      process.env["DD_DATA_STREAMS_ENABLED"] = "true";
    });

    afterEach(() => {
      jest.resetModules();
      delete process.env["DD_DATA_STREAMS_ENABLED"];
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
                  '{"x-datadog-trace-id":"4555236104497098341","x-datadog-parent-id":"3369753143434738315","x-datadog-sampled":"1","x-datadog-sampling-priority":"1","dd-pathway-ctx-base64":"some-base64-encoded-context"}',
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
        "dd-pathway-ctx-base64": "some-base64-encoded-context",
      });

      expect(traceContext?.toTraceId()).toBe("4555236104497098341");
      expect(traceContext?.toSpanId()).toBe("3369753143434738315");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");

      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledWith(
        "sqs",
        "arn:aws:sqs:eu-west-1:601427279990:metal-queue",
        {
          "x-datadog-parent-id": "3369753143434738315",
          "x-datadog-sampled": "1",
          "x-datadog-sampling-priority": "1",
          "x-datadog-trace-id": "4555236104497098341",
          "dd-pathway-ctx-base64": "some-base64-encoded-context",
        },
        false,
      );
    });

    it("extracts trace context from _datadog binaryValue when raw message delivery is used", () => {
      mockSpanContext = {
        toTraceId: () => "1234567890",
        toSpanId: () => "0987654321",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const ddHeaders = {
        "x-datadog-trace-id": "1234567890",
        "x-datadog-parent-id": "0987654321",
        "x-datadog-sampled": "1",
        "x-datadog-sampling-priority": "1",
        "dd-pathway-ctx-base64": "some-base64-encoded-context",
      };
      const ddHeadersString = JSON.stringify(ddHeaders);
      const ddHeadersBase64 = Buffer.from(ddHeadersString, "ascii").toString("base64");

      const payload: SQSEvent = {
        Records: [
          {
            messageId: "abc-123",
            receiptHandle: "MessageReceiptHandle",
            body: "Hello from SQS!",
            attributes: {
              ApproximateReceiveCount: "1",
              SentTimestamp: "1523232000000",
              SenderId: "123456789012",
              ApproximateFirstReceiveTimestamp: "1523232000001",
            },
            messageAttributes: {
              _datadog: {
                binaryValue: ddHeadersBase64,
                dataType: "Binary",
              },
            },
            md5OfBody: "x",
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:MyQueue",
            awsRegion: "us-east-1",
          },
        ],
      };

      const extractor = new SQSEventTraceExtractor(tracerWrapper);
      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(spyTracerWrapper).toHaveBeenCalledWith(ddHeaders);

      expect(traceContext?.toTraceId()).toBe("1234567890");
      expect(traceContext?.toSpanId()).toBe("0987654321");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");

      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledWith(
        "sqs",
        "arn:aws:sqs:us-east-1:123456789012:MyQueue",
        ddHeaders,
        false,
      );
    });

    // prettier-ignore
    it.each([
      ["Records", {}, 0],
      ["Records first entry", { Records: [] }, 0],
      ["messageAttributes in first entry", { Records: [{ messageAttributes: "{}", eventSourceARN: "arn:aws:sqs:us-east-1:MyQueue" }] }, 1],
      ["_datadog in messageAttributes", { Records: [{ messageAttributes: {}, eventSourceARN: "arn:aws:sqs:us-east-1:MyQueue" }] }, 1],
      ["stringValue in _datadog", { Records: [{ messageAttributes: { _datadog: {} }, eventSourceARN: "arn:aws:sqs:us-east-1:MyQueue" }] }, 1],
    ])("returns null and skips extracting when payload is missing '%s'", (_, payload, dsmCalls) => {
      const tracerWrapper = new TracerWrapper();
      const extractor = new SQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload as any);
      expect(traceContext).toBeNull();

      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledTimes(dsmCalls);

      if (dsmCalls > 0) {
        expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledWith(
          "sqs",
          "arn:aws:sqs:us-east-1:MyQueue",
          null,
          false,
        );
      }
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

    it("extracts trace context from AWSTraceHeader with valid payload", () => {
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
              AWSTraceHeader: "Root=1-65f2f78c-0000000008addb5405b376c0;Parent=5abcb7ed643995c7;Sampled=1",
            },
            messageAttributes: {},
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

      // Should not use ddtracer extractor. Because 1. it's an unnecessary extra step and
      // 2. More importantly, DD_TRACE_PROPAGATION_STYLE could cause extraction fail
      expect(spyTracerWrapper).not.toHaveBeenCalled();

      expect(traceContext?.toTraceId()).toBe("625397077193750208");
      expect(traceContext?.toSpanId()).toBe("6538302989251745223");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it("extracts trace context from Step Function SQS event", () => {
      // Reset StepFunctionContextService instance
      StepFunctionContextService["_instance"] = undefined as any;

      const tracerWrapper = new TracerWrapper();

      const payload: SQSEvent = {
        Records: [
          {
            messageId: "4ead33f3-51c8-4094-87bd-5325dc143cbd",
            receiptHandle:
              "AQEBrGtLZCUS1POUEZtdZRoB0zXgT14OQC48A4Xk4Qbnv/v4d0ib5rFI1wEah823t2hE9haPm6nNN1aGsJmYkqa9Y8qaBQscp9f7HKJyybT5hpdKEn07fY0VRv/Of63u1RN1YdFdY5uhI8XGWRc4w7t62lQwMMFY5Ahy7XLVwnav81KRjGFdgxzITrtx3YKxmISNvXzPiiHNKb7jT+ClfXi91bEYHi3Od3ji5xGajAofgYrj2VBDULyohsfMkwlvAanD2wfj2x++wL5LSpFEtMFnvThzt7Dh5FEZChVMzWV+fRFpljivHX58ZeuGv4yIIjLVuuDGn5uAY5ES4CsdINrBAru6K5gDSPUajRzE3TktNgAq5Niqfky1x0srLRAJjTDdmZK8/CXU0sRT/MCT99vkCHa0bC17S/9au5bCbrB4k/T9J8W39AA6kIYhebkq3IQr",
            body: '{"testData":"Hello from Step Functions to SQS"}',
            attributes: {
              ApproximateReceiveCount: "1",
              SentTimestamp: "1752594520503",
              SenderId: "AROAWGCM4HXU73A4V34AJ:EcGTcmgJbwwOwXPbloVwgSaDOmwhYBLH",
              ApproximateFirstReceiveTimestamp: "1752594520516",
            },
            messageAttributes: {
              _datadog: {
                stringValue:
                  '{"Execution":{"Id":"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-sqs-demo-dev-state-machine:a4912895-93a3-4803-a712-69fecb55c025","StartTime":"2025-07-15T15:48:40.302Z","Name":"a4912895-93a3-4803-a712-69fecb55c025","RoleArn":"arn:aws:iam::123456123456:role/rstrat-sfn-sqs-demo-dev-StepFunctionsExecutionRole-s6ozc2dVrvLH","RedriveCount":0},"StateMachine":{"Id":"arn:aws:states:sa-east-1:123456123456:stateMachine:rstrat-sfn-sqs-demo-dev-state-machine","Name":"rstrat-sfn-sqs-demo-dev-state-machine"},"State":{"Name":"SendToSQS","EnteredTime":"2025-07-15T15:48:40.333Z","RetryCount":0},"RootExecutionId":"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-sqs-demo-dev-state-machine:a4912895-93a3-4803-a712-69fecb55c025","serverless-version":"v1"}',
                stringListValues: [],
                binaryListValues: [],
                dataType: "String",
              },
            },
            md5OfMessageAttributes: "5469b8f90bb6ab27e95816c1fa178680",
            md5OfBody: "f0c0ddb2ed09a09e8791013f142e8d7e",
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:sa-east-1:123456123456:rstrat-sfn-sqs-demo-dev-process-event-queue",
            awsRegion: "sa-east-1",
          },
        ],
      };

      const extractor = new SQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      // The StepFunctionContextService generates deterministic trace IDs
      expect(traceContext?.toTraceId()).toBe("7148114900282288397");
      expect(traceContext?.toSpanId()).toBe("6711327198021343353");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });
  });
});
