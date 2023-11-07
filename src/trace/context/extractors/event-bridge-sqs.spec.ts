import { TracerWrapper } from "../../tracer-wrapper";
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

describe("EventBridgeSQSEventTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
    });

    afterEach(() => {
      jest.resetModules();
    });

    it("extracts trace context with valid payload", () => {
      mockSpanContext = {
        toTraceId: () => "7379586022458917877",
        toSpanId: () => "2644033662113726488",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
        Records: [
          {
            messageId: "e995e54f-1724-41fa-82c0-8b81821f854e",
            receiptHandle:
              "AQEB4mIfRcyqtzn1X5Ss+ConhTejVGc+qnAcmu3/Z9ZvbNkaPcpuDLX/bzvPD/ZkAXJUXZcemGSJmd7L3snZHKMP2Ck8runZiyl4mubiLb444pZvdiNPuGRJ6a3FvgS/GQPzho/9nNMyOi66m8Viwh70v4EUCPGO4JmD3TTDAUrrcAnqU4WSObjfC/NAp9bI6wH2CEyAYEfex6Nxplbl/jBf9ZUG0I3m3vQd0Q4l4gd4jIR4oxQUglU2Tldl4Kx5fMUAhTRLAENri6HsY81avBkKd9FAuxONlsITB5uj02kOkvLlRGEcalqsKyPJ7AFaDLrOLaL3U+yReroPEJ5R5nwhLOEbeN5HROlZRXeaAwZOIN8BjqdeooYTIOrtvMEVb7a6OPLMdH1XB+ddevtKAH8K9Tm2ZjpaA7dtBGh1zFVHzBk=",
            body: '{"version":"0","id":"af718b2a-b987-e8c0-7a2b-a188fad2661a","detail-type":"my.Detail","source":"my.Source","account":"425362996713","time":"2023-08-03T22:49:03Z","region":"us-east-1","resources":[],"detail":{"text":"Hello, world!","_datadog":{"x-datadog-trace-id":"7379586022458917877","x-datadog-parent-id":"2644033662113726488","x-datadog-sampling-priority":"1","x-datadog-tags":"_dd.p.dm=-0"}}}',
            attributes: {
              ApproximateReceiveCount: "1",
              AWSTraceHeader: "Root=1-64cc2edd-112fbf1701d1355973a11d57;Parent=7d5a9776024b2d42;Sampled=0",
              SentTimestamp: "1691102943638",
              SenderId: "AIDAJXNJGGKNS7OSV23OI",
              ApproximateFirstReceiveTimestamp: "1691102943647",
            },
            messageAttributes: {},
            md5OfBody: "93d9f0cd8886d1e000a1a0b7007bffc4",
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:us-east-1:425362996713:lambda-eb-sqs-lambda-dev-demo-queue",
            awsRegion: "us-east-1",
          },
        ],
      };

      const extractor = new EventBridgeSQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-parent-id": "2644033662113726488",
        "x-datadog-sampling-priority": "1",
        "x-datadog-tags": "_dd.p.dm=-0",
        "x-datadog-trace-id": "7379586022458917877",
      });

      expect(traceContext?.toTraceId()).toBe("7379586022458917877");
      expect(traceContext?.toSpanId()).toBe("2644033662113726488");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it.each([
      ["Records", {}],
      ["Records first entry", { Records: [] }],
      ["Records first entry body", { Records: [{}] }],
      ["valid data in body", { Records: [{ body: "{" }] }], // JSON.parse should fail
      ["detail in body", { Records: [{ body: "{}" }] }],
      ["_datadog in detail", { Records: [{ body: '{"detail":{"text":"Hello, world!"}}' }] }],
    ])("returns null and skips extracting when payload is missing '%s'", (_, payload) => {
      const tracerWrapper = new TracerWrapper();
      const extractor = new EventBridgeSQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload as any);
      expect(traceContext).toBeNull();
    });

    it("returns null when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper();

      const payload = {
        Records: [
          {
            messageId: "e995e54f-1724-41fa-82c0-8b81821f854e",
            receiptHandle:
              "AQEB4mIfRcyqtzn1X5Ss+ConhTejVGc+qnAcmu3/Z9ZvbNkaPcpuDLX/bzvPD/ZkAXJUXZcemGSJmd7L3snZHKMP2Ck8runZiyl4mubiLb444pZvdiNPuGRJ6a3FvgS/GQPzho/9nNMyOi66m8Viwh70v4EUCPGO4JmD3TTDAUrrcAnqU4WSObjfC/NAp9bI6wH2CEyAYEfex6Nxplbl/jBf9ZUG0I3m3vQd0Q4l4gd4jIR4oxQUglU2Tldl4Kx5fMUAhTRLAENri6HsY81avBkKd9FAuxONlsITB5uj02kOkvLlRGEcalqsKyPJ7AFaDLrOLaL3U+yReroPEJ5R5nwhLOEbeN5HROlZRXeaAwZOIN8BjqdeooYTIOrtvMEVb7a6OPLMdH1XB+ddevtKAH8K9Tm2ZjpaA7dtBGh1zFVHzBk=",
            // body is missing _datadog
            body: '{"version":"0","id":"af718b2a-b987-e8c0-7a2b-a188fad2661a","detail-type":"my.Detail","source":"my.Source","account":"425362996713","time":"2023-08-03T22:49:03Z","region":"us-east-1","resources":[],"detail":{"text":"Hello, world!"}}',
            attributes: {
              ApproximateReceiveCount: "1",
              AWSTraceHeader: "Root=1-64cc2edd-112fbf1701d1355973a11d57;Parent=7d5a9776024b2d42;Sampled=0",
              SentTimestamp: "1691102943638",
              SenderId: "AIDAJXNJGGKNS7OSV23OI",
              ApproximateFirstReceiveTimestamp: "1691102943647",
            },
            messageAttributes: {},
            md5OfBody: "93d9f0cd8886d1e000a1a0b7007bffc4",
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:us-east-1:425362996713:lambda-eb-sqs-lambda-dev-demo-queue",
            awsRegion: "us-east-1",
          },
        ],
      };

      const extractor = new EventBridgeSQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).toBeNull();
    });
  });
});
