import { TracerWrapper } from "../../tracer-wrapper";
import { EventBridgeSQSEventTraceExtractor } from "./event-bridge-sqs";
import { StepFunctionContextService } from "../../step-function-service";

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
            body: '{"version":"0","id":"af718b2a-b987-e8c0-7a2b-a188fad2661a","detail-type":"my.Detail","source":"my.Source","account":"123456123456","time":"2023-08-03T22:49:03Z","region":"us-east-1","resources":[],"detail":{"text":"Hello, world!","_datadog":{"x-datadog-trace-id":"7379586022458917877","x-datadog-parent-id":"2644033662113726488","x-datadog-sampling-priority":"1","x-datadog-tags":"_dd.p.dm=-0"}}}',
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

    it("extracts trace context from Step Function EventBridge-SQS event", () => {
      // Reset StepFunctionContextService instance
      StepFunctionContextService["_instance"] = undefined as any;

      const tracerWrapper = new TracerWrapper();

      const payload = {
        Records: [
          {
            messageId: "0fc0e02f-ab25-4fde-b5ff-22aba9a9f20e",
            receiptHandle:
              "AQEBROlXUgqqRdo/j0GcfxBNldIKy8FO6Ee0ZnP5YeAp4pwQ+v9XovX47vSzNHAZooCa0r8D7Uoow0y4bhGiH/Tt5HXAseDUlvWHB6bULonzAdvRmLd1W1OCY9D1uH3TpHZYn6JdoQd6Koxndx5wDwhv5UKxcbOwDjlc6X/30OKkTm4gcr7Otzu4GxCt6N/FmDxcRIDogZk80UE1kN6Q5EHI9LB6V+oleqqCbQwg5FYmbVc+DjwPBY4/5NI6x1/XZLFZA0TdezOdOuNq4+4DGK8e35Bafg4hXp+06zg8E5XPdMQV5V4iDzJhenPEdXusGL36byBHyC4aDunTSpeIND0/0ctqyH1vEJHo09LJ1jztPj05hBQeDU5QXCIKRpuo5+nEHE+Jm1ZLrUWUoIg1uAIamDzQ0CWNtPjGkNn3POiTGpD2e0aqrE5VpXZ8N30HKKFM",
            body: '{"version":"0","id":"1aec4f0c-35e7-934c-9928-a5db3e526bca","detail-type":"ProcessEvent","source":"demo.stepfunction","account":"123456123456","time":"2025-07-14T19:33:03Z","region":"sa-east-1","resources":["arn:aws:states:sa-east-1:123456123456:stateMachine:rstrat-sfn-evb-sqs-demo-dev-state-machine","arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-evb-sqs-demo-dev-state-machine:aa2f4ded-196f-4d6b-b41d-aa64f3193f2d"],"detail":{"message":"Event from Step Functions","timestamp":"2025-07-14T19:33:03.483Z","executionName":"aa2f4ded-196f-4d6b-b41d-aa64f3193f2d","stateMachineName":"rstrat-sfn-evb-sqs-demo-dev-state-machine","input":{"testData":"Hello with SQS integration"},"_datadog":{"Execution":{"Id":"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-evb-sqs-demo-dev-state-machine:aa2f4ded-196f-4d6b-b41d-aa64f3193f2d","StartTime":"2025-07-14T19:33:03.446Z","Name":"aa2f4ded-196f-4d6b-b41d-aa64f3193f2d","RoleArn":"arn:aws:iam::123456123456:role/rstrat-sfn-evb-sqs-demo-d-StepFunctionsExecutionRol-mAumgN9x07FQ","RedriveCount":0},"StateMachine":{"Id":"arn:aws:states:sa-east-1:123456123456:stateMachine:rstrat-sfn-evb-sqs-demo-dev-state-machine","Name":"rstrat-sfn-evb-sqs-demo-dev-state-machine"},"State":{"Name":"PublishToEventBridge","EnteredTime":"2025-07-14T19:33:03.483Z","RetryCount":0},"RootExecutionId":"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-evb-sqs-demo-dev-state-machine:aa2f4ded-196f-4d6b-b41d-aa64f3193f2d","serverless-version":"v1"}}}',
            attributes: {
              ApproximateReceiveCount: "1",
              SentTimestamp: "1752521583745",
              SenderId: "AIDAIELDKKY42PBA6I2NG",
              ApproximateFirstReceiveTimestamp: "1752521583758",
            },
            messageAttributes: {},
            md5OfBody: "957cded00b7b10a6e1b79864f24a7b5f",
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:sa-east-1:123456123456:rstrat-sfn-evb-sqs-demo-dev-process-event-queue",
            awsRegion: "sa-east-1",
          },
        ],
      };

      const extractor = new EventBridgeSQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      // The trace IDs are deterministically generated from the Step Function execution context
      expect(traceContext?.toTraceId()).toBe("7858567057595668526");
      expect(traceContext?.toSpanId()).toBe("3674709292670593712");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });
  });
});
