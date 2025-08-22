import { TracerWrapper } from "../../tracer-wrapper";
import { KinesisEventTraceExtractor } from "./kinesis";

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

describe("KinesisEventTraceExtractor", () => {
  const mockConfig = {
    autoPatchHTTP: true,
    captureLambdaPayload: false,
    captureLambdaPayloadMaxDepth: 10,
    createInferredSpan: true,
    encodeAuthorizerContext: true,
    decodeAuthorizerContext: true,
    mergeDatadogXrayTraces: false,
    injectLogContext: false,
    minColdStartTraceDuration: 3,
    coldStartTraceSkipLib: "",
    addSpanPointers: true,
    dataStreamsEnabled: true,
  };

  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
      mockDataStreamsCheckpointer.setConsumeCheckpoint.mockClear();
    });

    afterEach(() => {
      jest.resetModules();
      delete process.env["DD_DATA_STREAMS_ENABLED"];
    });

    it("extracts trace context with valid payload", () => {
      mockSpanContext = {
        toTraceId: () => "667309514221035538",
        toSpanId: () => "1350735035497811828",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper(mockConfig);

      const payload = {
        Records: [
          {
            kinesis: {
              kinesisSchemaVersion: "1.0",
              partitionKey: "cdbfd750-cec0-4f0f-a4b0-82ae6152c7fb",
              sequenceNumber: "49625698045709644136382874226371117765484751339579768834",
              data: "eyJJJ20gbWFkZSBvZiB3YXgsIExhcnJ5IjoiV2hhdCBhcmUgeW91IG1hZGUgb2Y/IiwiX2RhdGFkb2ciOnsieC1kYXRhZG9nLXRyYWNlLWlkIjoiNjY3MzA5NTE0MjIxMDM1NTM4IiwieC1kYXRhZG9nLXBhcmVudC1pZCI6IjEzNTA3MzUwMzU0OTc4MTE4MjgiLCJ4LWRhdGFkb2ctc2FtcGxlZCI6IjEiLCJ4LWRhdGFkb2ctc2FtcGxpbmctcHJpb3JpdHkiOiIxIiwiZGQtcGF0aHdheS1jdHgtYmFzZTY0Ijoic29tZS1iYXNlNjQtZW5jb2RlZC1jb250ZXh0In19Cg==",
              approximateArrivalTimestamp: 1642518727.248,
            },
            eventSource: "aws:kinesis",
            eventID: "shardId-000000000000:49545115243490985018280067714973144582180062593244200961",
            invokeIdentityArn: "arn:aws:iam::EXAMPLE",
            eventVersion: "1.0",
            eventName: "aws:kinesis:record",
            eventSourceARN: "arn:aws:kinesis:EXAMPLE",
            awsRegion: "us-east-1",
          },
        ],
      };

      const extractor = new KinesisEventTraceExtractor(tracerWrapper, mockConfig);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(spyTracerWrapper).toHaveBeenLastCalledWith({
        "x-datadog-parent-id": "1350735035497811828",
        "x-datadog-sampled": "1",
        "x-datadog-sampling-priority": "1",
        "x-datadog-trace-id": "667309514221035538",
        "dd-pathway-ctx-base64": "some-base64-encoded-context",
      });

      expect(traceContext?.toTraceId()).toBe("667309514221035538");
      expect(traceContext?.toSpanId()).toBe("1350735035497811828");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");

      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledWith(
        "kinesis",
        "arn:aws:kinesis:EXAMPLE",
        {
          "x-datadog-parent-id": "1350735035497811828",
          "x-datadog-sampled": "1",
          "x-datadog-sampling-priority": "1",
          "x-datadog-trace-id": "667309514221035538",
          "dd-pathway-ctx-base64": "some-base64-encoded-context",
        },
        false,
      );
    });

    it.each([
      ["Records", {}, 0],
      ["Records first entry", { Records: [] }, 0],
      ["valid data in kinesis", { Records: [{ kinesis: { data: "{" }, eventSourceARN: "arn:aws:kinesis:test" }] }, 0], // JSON.parse should fail
      ["_datadog in data", { Records: [{ kinesis: { data: "e30=" }, eventSourceARN: "arn:aws:kinesis:test" }] }, 1],
    ])("returns null and skips extracting when payload is missing '%s'", (_, payload, dsmCalls) => {
      const tracerWrapper = new TracerWrapper(mockConfig);
      const extractor = new KinesisEventTraceExtractor(tracerWrapper, mockConfig);

      const traceContext = extractor.extract(payload as any);
      expect(traceContext).toBeNull();

      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledTimes(dsmCalls);

      if (dsmCalls > 0) {
        expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledWith(
          "kinesis",
          "arn:aws:kinesis:test",
          null,
          false,
        );
      }
    });

    it("calls setConsumeCheckpoint for each record", () => {
      mockSpanContext = {
        toTraceId: () => "667309514221035538",
        toSpanId: () => "1350735035497811828",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper(mockConfig);

      const makeKinesisRecord = (eventSourceARN: string, hasDatadogHeaders: boolean) => {
        const baseData = { some: "data" };
        const dataWithHeaders = hasDatadogHeaders
          ? {
              ...baseData,
              _datadog: {
                "x-datadog-trace-id": "667309514221035538",
                "x-datadog-parent-id": "1350735035497811828",
                "x-datadog-sampled": "1",
                "x-datadog-sampling-priority": "1",
                "dd-pathway-ctx-base64": "some-base64-encoded-context",
              },
            }
          : baseData;

        const encodedData = Buffer.from(JSON.stringify(dataWithHeaders)).toString("base64");

        return {
          kinesis: {
            kinesisSchemaVersion: "1.0",
            partitionKey: "test-partition",
            sequenceNumber: "12345",
            data: encodedData,
            approximateArrivalTimestamp: 1642518727.248,
          },
          eventSource: "aws:kinesis",
          eventID: "test-event-id",
          invokeIdentityArn: "arn:aws:iam::EXAMPLE",
          eventVersion: "1.0",
          eventName: "aws:kinesis:record",
          eventSourceARN: eventSourceARN,
          awsRegion: "us-east-1",
        };
      };

      const payload = {
        Records: [
          makeKinesisRecord("arn:aws:kinesis:us-east-1:123456789012:stream/stream-1", true),
          makeKinesisRecord("arn:aws:kinesis:us-east-1:123456789012:stream/stream-2", false),
          makeKinesisRecord("arn:aws:kinesis:us-east-1:123456789012:stream/stream-3", true),
          makeKinesisRecord("arn:aws:kinesis:us-east-1:123456789012:stream/stream-4", false),
        ],
      };

      const extractor = new KinesisEventTraceExtractor(tracerWrapper, mockConfig);
      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledTimes(4);
      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenNthCalledWith(
        1,
        "kinesis",
        "arn:aws:kinesis:us-east-1:123456789012:stream/stream-1",
        {
          "x-datadog-trace-id": "667309514221035538",
          "x-datadog-parent-id": "1350735035497811828",
          "x-datadog-sampled": "1",
          "x-datadog-sampling-priority": "1",
          "dd-pathway-ctx-base64": "some-base64-encoded-context",
        },
        false,
      );
      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenNthCalledWith(
        2,
        "kinesis",
        "arn:aws:kinesis:us-east-1:123456789012:stream/stream-2",
        null,
        false,
      );
      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenNthCalledWith(
        3,
        "kinesis",
        "arn:aws:kinesis:us-east-1:123456789012:stream/stream-3",
        {
          "x-datadog-trace-id": "667309514221035538",
          "x-datadog-parent-id": "1350735035497811828",
          "x-datadog-sampled": "1",
          "x-datadog-sampling-priority": "1",
          "dd-pathway-ctx-base64": "some-base64-encoded-context",
        },
        false,
      );
      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenNthCalledWith(
        4,
        "kinesis",
        "arn:aws:kinesis:us-east-1:123456789012:stream/stream-4",
        null,
        false,
      );
    });

    it("returns null when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper(mockConfig);

      const payload = {
        Records: [
          {
            kinesis: {
              kinesisSchemaVersion: "1.0",
              partitionKey: "cdbfd750-cec0-4f0f-a4b0-82ae6152c7fb",
              sequenceNumber: "49625698045709644136382874226371117765484751339579768834",
              data: "e19kYXRhZG9nOiB7fX0", // empty `_datadog` headers
              approximateArrivalTimestamp: 1642518727.248,
            },
            eventSource: "aws:kinesis",
            eventID: "shardId-000000000000:49545115243490985018280067714973144582180062593244200961",
            invokeIdentityArn: "arn:aws:iam::EXAMPLE",
            eventVersion: "1.0",
            eventName: "aws:kinesis:record",
            eventSourceARN: "arn:aws:kinesis:EXAMPLE",
            awsRegion: "us-east-1",
          },
        ],
      };

      const extractor = new KinesisEventTraceExtractor(tracerWrapper, mockConfig);

      const traceContext = extractor.extract(payload);
      expect(traceContext).toBeNull();
    });

    it("extracts trace context from multiple records when DSM is disabled but does not call setConsumeCheckpoint", () => {
      mockSpanContext = {
        toTraceId: () => "667309514221035538",
        toSpanId: () => "1350735035497811828",
        _sampling: {
          priority: "1",
        },
      };
      const disabledConfig = { ...mockConfig, dataStreamsEnabled: false };
      const tracerWrapper = new TracerWrapper(disabledConfig);

      const makeKinesisRecord = (eventSourceARN: string, hasDatadogHeaders: boolean) => {
        const baseData = { some: "data" };
        const dataWithHeaders = hasDatadogHeaders
          ? {
              ...baseData,
              _datadog: {
                "x-datadog-trace-id": "667309514221035538",
                "x-datadog-parent-id": "1350735035497811828",
                "x-datadog-sampled": "1",
                "x-datadog-sampling-priority": "1",
                "dd-pathway-ctx-base64": "some-base64-encoded-context",
              },
            }
          : baseData;

        const encodedData = Buffer.from(JSON.stringify(dataWithHeaders)).toString("base64");

        return {
          kinesis: {
            kinesisSchemaVersion: "1.0",
            partitionKey: "test-partition",
            sequenceNumber: "12345",
            data: encodedData,
            approximateArrivalTimestamp: 1642518727.248,
          },
          eventSource: "aws:kinesis",
          eventID: "test-event-id",
          invokeIdentityArn: "arn:aws:iam::EXAMPLE",
          eventVersion: "1.0",
          eventName: "aws:kinesis:record",
          eventSourceARN: eventSourceARN,
          awsRegion: "us-east-1",
        };
      };

      const payload = {
        Records: [
          makeKinesisRecord("arn:aws:kinesis:us-east-1:123456789012:stream/stream-1", true),
          makeKinesisRecord("arn:aws:kinesis:us-east-1:123456789012:stream/stream-2", false),
          makeKinesisRecord("arn:aws:kinesis:us-east-1:123456789012:stream/stream-3", true),
        ],
      };

      const extractor = new KinesisEventTraceExtractor(tracerWrapper, mockConfig);
      const traceContext = extractor.extract(payload);

      // Should still extract trace context from first record
      expect(traceContext).not.toBeNull();
      expect(traceContext?.toTraceId()).toBe("667309514221035538");
      expect(traceContext?.toSpanId()).toBe("1350735035497811828");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");

      // Should NOT call setConsumeCheckpoint when DSM is disabled
      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledTimes(0);
    });
  });
});
