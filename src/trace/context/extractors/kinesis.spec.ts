import { TraceConfig } from "../../listener";
import { TracerWrapper } from "../../tracer-wrapper";
import { KinesisEventTraceExtractor } from "./kinesis";
import { EventBridgeSQSEventTraceExtractor } from "./event-bridge-sqs";

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

describe("KinesisEventTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
    });

    afterEach(() => {
      jest.resetModules();
    });

    it("extracts trace context with valid payload", () => {
      mockSpanContext = {
        toTraceId: () => "667309514221035538",
        toSpanId: () => "1350735035497811828",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
        Records: [
          {
            kinesis: {
              kinesisSchemaVersion: "1.0",
              partitionKey: "cdbfd750-cec0-4f0f-a4b0-82ae6152c7fb",
              sequenceNumber: "49625698045709644136382874226371117765484751339579768834",
              data: "eyJJJ20gbWFkZSBvZiB3YXgsIExhcnJ5IjoiV2hhdCBhcmUgeW91IG1hZGUgb2Y/IiwiX2RhdGFkb2ciOnsieC1kYXRhZG9nLXRyYWNlLWlkIjoiNjY3MzA5NTE0MjIxMDM1NTM4IiwieC1kYXRhZG9nLXBhcmVudC1pZCI6IjEzNTA3MzUwMzU0OTc4MTE4MjgiLCJ4LWRhdGFkb2ctc2FtcGxlZCI6IjEiLCJ4LWRhdGFkb2ctc2FtcGxpbmctcHJpb3JpdHkiOiIxIn19",
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

      const extractor = new KinesisEventTraceExtractor(tracerWrapper, {} as TraceConfig);

      const traceContext = extractor.extract(payload);
      expect(traceContext.length).toBe(1);

      expect(spyTracerWrapper).toHaveBeenLastCalledWith({
        "x-datadog-parent-id": "1350735035497811828",
        "x-datadog-sampled": "1",
        "x-datadog-sampling-priority": "1",
        "x-datadog-trace-id": "667309514221035538",
      });

      expect(traceContext?.[0].toTraceId()).toBe("667309514221035538");
      expect(traceContext?.[0].toSpanId()).toBe("1350735035497811828");
      expect(traceContext?.[0].sampleMode()).toBe("1");
      expect(traceContext?.[0].source).toBe("event");
    });


    it("only extracts first trace context with multiple input payloads", () => {
      mockSpanContext = {
        toTraceId: () => "667309514221035538",
        toSpanId: () => "1350735035497811828",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
        Records: [
          {
            kinesis: {
              kinesisSchemaVersion: "1.0",
              partitionKey: "cdbfd750-cec0-4f0f-a4b0-82ae6152c7fb",
              sequenceNumber: "49625698045709644136382874226371117765484751339579768834",
              data: "eyJJJ20gbWFkZSBvZiB3YXgsIExhcnJ5IjoiV2hhdCBhcmUgeW91IG1hZGUgb2Y/IiwiX2RhdGFkb2ciOnsieC1kYXRhZG9nLXRyYWNlLWlkIjoiNjY3MzA5NTE0MjIxMDM1NTM4IiwieC1kYXRhZG9nLXBhcmVudC1pZCI6IjEzNTA3MzUwMzU0OTc4MTE4MjgiLCJ4LWRhdGFkb2ctc2FtcGxlZCI6IjEiLCJ4LWRhdGFkb2ctc2FtcGxpbmctcHJpb3JpdHkiOiIxIn19",
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
          {
            kinesis: {
              kinesisSchemaVersion: "1.0",
              partitionKey: "cdbfd750-cec0-4f0f-a4b0-82ae6152c7fb",
              sequenceNumber: "49625698045709644136382874226371117765484751339579768834",
              data: "eyJJJ20gbWFkZSBvZiB3YXgsIExhcnJ5IjoiV2hhdCBhcmUgeW91IG1hZGUgb2Y/IiwiX2RhdGFkb2ciOnsieC1kYXRhZG9nLXRyYWNlLWlkIjoiNjY3MzA5NTE0MjIxMDM1NTM4IiwieC1kYXRhZG9nLXBhcmVudC1pZCI6IjEzNTA3MzUwMzU0OTc4MTE4MjgiLCJ4LWRhdGFkb2ctc2FtcGxlZCI6IjEiLCJ4LWRhdGFkb2ctc2FtcGxpbmctcHJpb3JpdHkiOiIxIn19",
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

      const extractor = new KinesisEventTraceExtractor(tracerWrapper, {} as TraceConfig);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(spyTracerWrapper).toHaveBeenLastCalledWith({
        "x-datadog-parent-id": "1350735035497811828",
        "x-datadog-sampled": "1",
        "x-datadog-sampling-priority": "1",
        "x-datadog-trace-id": "667309514221035538",
      });

      expect(traceContext?.[0].toTraceId()).toBe("667309514221035538");
      expect(traceContext?.[0].toSpanId()).toBe("1350735035497811828");
      expect(traceContext?.[0].sampleMode()).toBe("1");
      expect(traceContext?.[0].source).toBe("event");
    });

    it("extract all trace contexts when span links is enabled", () => {
      mockSpanContext = {
        toTraceId: () => "667309514221035538",
        toSpanId: () => "1350735035497811828",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
        Records: [
          {
            kinesis: {
              kinesisSchemaVersion: "1.0",
              partitionKey: "cdbfd750-cec0-4f0f-a4b0-82ae6152c7fb",
              sequenceNumber: "49625698045709644136382874226371117765484751339579768834",
              data: "eyJJJ20gbWFkZSBvZiB3YXgsIExhcnJ5IjoiV2hhdCBhcmUgeW91IG1hZGUgb2Y/IiwiX2RhdGFkb2ciOnsieC1kYXRhZG9nLXRyYWNlLWlkIjoiNjY3MzA5NTE0MjIxMDM1NTM4IiwieC1kYXRhZG9nLXBhcmVudC1pZCI6IjEzNTA3MzUwMzU0OTc4MTE4MjgiLCJ4LWRhdGFkb2ctc2FtcGxlZCI6IjEiLCJ4LWRhdGFkb2ctc2FtcGxpbmctcHJpb3JpdHkiOiIxIn19",
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
          {
            kinesis: {
              kinesisSchemaVersion: "1.0",
              partitionKey: "cdbfd750-cec0-4f0f-a4b0-82ae6152c7fb",
              sequenceNumber: "49625698045709644136382874226371117765484751339579768834",
              data: "eyJJJ20gbWFkZSBvZiB3YXgsIExhcnJ5IjoiV2hhdCBhcmUgeW91IG1hZGUgb2Y/IiwiX2RhdGFkb2ciOnsieC1kYXRhZG9nLXRyYWNlLWlkIjoiNjY3MzA5NTE0MjIxMDM1NTM4IiwieC1kYXRhZG9nLXBhcmVudC1pZCI6IjEzNTA3MzUwMzU0OTc4MTE4MjgiLCJ4LWRhdGFkb2ctc2FtcGxlZCI6IjEiLCJ4LWRhdGFkb2ctc2FtcGxpbmctcHJpb3JpdHkiOiIxIn19",
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

      const extractor = new KinesisEventTraceExtractor(tracerWrapper, {useSpanLinks: true} as TraceConfig);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(traceContext?.length).toBe(2);
    });


    it.each([
      ["Records", {}],
      ["Records first entry", { Records: [] }],
      ["valid data in kinesis", { Records: [{ kinesis: { data: "{" } }] }], // JSON.parse should fail
      ["_datadog in data", { Records: [{ kinesis: { data: "e30=" } }] }],
    ])("returns empty array and skips extracting when payload is missing '%s'", (_, payload) => {
      const tracerWrapper = new TracerWrapper();
      const extractor = new KinesisEventTraceExtractor(tracerWrapper, {} as TraceConfig);

      const traceContext = extractor.extract(payload as any);
      expect(traceContext).toStrictEqual([]);
    });

    it("returns empty array when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper();

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

      const extractor = new KinesisEventTraceExtractor(tracerWrapper, {} as TraceConfig);

      const traceContext = extractor.extract(payload);
      expect(traceContext).toStrictEqual([]);
    });
  });
});
