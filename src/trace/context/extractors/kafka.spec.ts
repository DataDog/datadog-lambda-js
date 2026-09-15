import { TracerWrapper } from "../../tracer-wrapper";
import { KafkaEventTraceExtractor } from "./kafka";

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
jest.mock("dd-trace", () => {
  return {
    ...jest.requireActual("dd-trace"),
    _tracer: { _service: {} },
    extract: (_carrier: any, _headers: any) => mockSpanContext,
    dataStreamsCheckpointer: mockDataStreamsCheckpointer,
  };
});
const spyTracerWrapper = jest.spyOn(TracerWrapper.prototype, "extract");

/** Encodes a header value the way Kafka/Lambda delivers it: a byte array. */
const toBytes = (value: string): number[] => Array.from(Buffer.from(value, "utf8"));

const PATHWAY_CTX = "4eia3s7L38Gs9qeLlGis9qeLlGg=";

const buildRecord = (overrides: Partial<any> = {}): any => ({
  topic: "demo-topic",
  partition: 0,
  offset: "5",
  timestamp: 1789402611155,
  timestampType: "CREATE_TIME",
  key: Buffer.from("some-key").toString("base64"),
  value: Buffer.from(JSON.stringify({ id: "abc" })).toString("base64"),
  headers: [
    { "content-type": toBytes("application/json") },
    { "x-datadog-trace-id": toBytes("6043338675393224912") },
    { "x-datadog-parent-id": toBytes("2162012466251825722") },
    { "x-datadog-sampling-priority": toBytes("1") },
    { "dd-pathway-ctx-base64": toBytes(PATHWAY_CTX) },
  ],
  ...overrides,
});

const buildEvent = (records: Record<string, any[]>): any => ({
  eventSource: "aws:kafka",
  eventSourceArn: "arn:aws:kafka:us-east-2:123456789012:cluster/demo-cluster/39027fc5-2658-4c2d-a102-4dcd3a10301b-s2",
  bootstrapServers: "boot-abc123.c2.kafka-serverless.us-east-2.amazonaws.com:9098",
  records,
});

describe("KafkaEventTraceExtractor", () => {
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
    appsecEnabled: false,
  };

  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
      mockDataStreamsCheckpointer.setConsumeCheckpoint.mockClear();
    });

    it("extracts trace context with valid payload", () => {
      mockSpanContext = {
        toTraceId: () => "6043338675393224912",
        toSpanId: () => "2162012466251825722",
        _sampling: { priority: "1" },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = buildEvent({ "demo-topic-0": [buildRecord()] });

      const extractor = new KafkaEventTraceExtractor(tracerWrapper, mockConfig);
      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      // Headers are decoded from byte arrays into a flat string carrier.
      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "content-type": "application/json",
        "x-datadog-trace-id": "6043338675393224912",
        "x-datadog-parent-id": "2162012466251825722",
        "x-datadog-sampling-priority": "1",
        "dd-pathway-ctx-base64": PATHWAY_CTX,
      });

      expect(traceContext?.toTraceId()).toBe("6043338675393224912");
      expect(traceContext?.toSpanId()).toBe("2162012466251825722");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it("sets the DSM consume checkpoint with the topic name, not the cluster ARN", () => {
      const tracerWrapper = new TracerWrapper();
      const payload = buildEvent({ "demo-topic-0": [buildRecord()] });

      const extractor = new KafkaEventTraceExtractor(tracerWrapper, mockConfig);
      extractor.extract(payload);

      // The DSM target must match the `topic:<topic>` tag dd-trace's kafkajs
      // producer plugin emits. Passing the ARN would break the pathway.
      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledWith(
        "kafka",
        "demo-topic",
        expect.objectContaining({ "dd-pathway-ctx-base64": PATHWAY_CTX }),
        false,
      );
    });

    it("sets one checkpoint per record across multiple topic-partitions", () => {
      const tracerWrapper = new TracerWrapper();
      const payload = buildEvent({
        "demo-topic-0": [buildRecord({ offset: "1" }), buildRecord({ offset: "2" })],
        "other-topic-3": [buildRecord({ topic: "other-topic", partition: 3, offset: "9" })],
      });

      const extractor = new KafkaEventTraceExtractor(tracerWrapper, mockConfig);
      extractor.extract(payload);

      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledTimes(3);
      const targets = mockDataStreamsCheckpointer.setConsumeCheckpoint.mock.calls.map((c: any[]) => c[1]);
      expect(targets).toEqual(["demo-topic", "demo-topic", "other-topic"]);
    });

    it("does not set checkpoints when Data Streams is disabled", () => {
      const tracerWrapper = new TracerWrapper();
      const payload = buildEvent({ "demo-topic-0": [buildRecord()] });

      const extractor = new KafkaEventTraceExtractor(tracerWrapper, {
        ...mockConfig,
        dataStreamsEnabled: false,
      });
      extractor.extract(payload);

      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).not.toHaveBeenCalled();
    });

    it("recovers the topic from the map key when the record omits it", () => {
      const tracerWrapper = new TracerWrapper();
      const record = buildRecord();
      delete record.topic;
      // Topic names may themselves contain hyphens; only the trailing
      // partition number is trimmed.
      const payload = buildEvent({ "orders-eu-west-12": [record] });

      const extractor = new KafkaEventTraceExtractor(tracerWrapper, mockConfig);
      extractor.extract(payload);

      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledWith(
        "kafka",
        "orders-eu-west",
        expect.any(Object),
        false,
      );
    });

    it("handles byte arrays delivered as numeric strings", () => {
      mockSpanContext = {
        toTraceId: () => "6043338675393224912",
        toSpanId: () => "2162012466251825722",
        _sampling: { priority: "1" },
      };
      const tracerWrapper = new TracerWrapper();

      const record = buildRecord({
        headers: [{ "dd-pathway-ctx-base64": toBytes(PATHWAY_CTX).map(String) }],
      });
      const payload = buildEvent({ "demo-topic-0": [record] });

      const extractor = new KafkaEventTraceExtractor(tracerWrapper, mockConfig);
      extractor.extract(payload);

      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledWith(
        "kafka",
        "demo-topic",
        { "dd-pathway-ctx-base64": PATHWAY_CTX },
        false,
      );
    });

    it("returns null when payload is empty", () => {
      const tracerWrapper = new TracerWrapper();
      const payload = buildEvent({});

      const extractor = new KafkaEventTraceExtractor(tracerWrapper, mockConfig);
      const traceContext = extractor.extract(payload);

      expect(traceContext).toBeNull();
      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).not.toHaveBeenCalled();
    });

    it("returns null but still checkpoints when a record carries no headers", () => {
      const tracerWrapper = new TracerWrapper();
      const payload = buildEvent({ "demo-topic-0": [buildRecord({ headers: [] })] });

      const extractor = new KafkaEventTraceExtractor(tracerWrapper, mockConfig);
      const traceContext = extractor.extract(payload);

      expect(traceContext).toBeNull();

      // Records from uninstrumented producers have no context to extract, but
      // they must still produce a DSM consume node as a pathway root, matching
      // the SQS/Kinesis extractors' null-carrier behaviour.
      expect(mockDataStreamsCheckpointer.setConsumeCheckpoint).toHaveBeenCalledWith("kafka", "demo-topic", null, false);
    });

    it("returns null when headers contain no trace context", () => {
      const tracerWrapper = new TracerWrapper();
      const payload = buildEvent({
        "demo-topic-0": [buildRecord({ headers: [{ "content-type": toBytes("application/json") }] })],
      });

      const extractor = new KafkaEventTraceExtractor(tracerWrapper, mockConfig);
      const traceContext = extractor.extract(payload);

      // mockSpanContext is null -> extract yields nothing.
      expect(traceContext).toBeNull();
    });
  });
});
