import { TracerWrapper } from "../../tracer-wrapper";
import { EventBridgeSNSEventTraceExtractor } from "./event-bridge-sns";
import { StepFunctionContextService } from "../../step-function-service";
import { SNSEvent } from "aws-lambda";

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

describe("EventBridgeSNSEventTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
    });

    afterEach(() => {
      jest.resetModules();
    });

    it("extracts trace context with valid payload", () => {
      mockSpanContext = {
        toTraceId: () => "1234567890123456789",
        toSpanId: () => "9876543210987654321",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
        Records: [
          {
            EventSource: "aws:sns",
            EventVersion: "1.0",
            EventSubscriptionArn: "arn:aws:sns:us-east-1:123456123456:my-topic:12345678-1234-1234-1234-123456789012",
            Sns: {
              Type: "Notification",
              MessageId: "12345678-1234-1234-1234-123456789012",
              TopicArn: "arn:aws:sns:us-east-1:123456123456:my-topic",
              Message: '{"version":"0","id":"12345678-1234-1234-1234-123456789012","detail-type":"my.Detail","source":"my.Source","account":"123456123456","time":"2023-08-03T22:49:03Z","region":"us-east-1","resources":[],"detail":{"text":"Hello, world!","_datadog":{"x-datadog-trace-id":"1234567890123456789","x-datadog-parent-id":"9876543210987654321","x-datadog-sampling-priority":"1","x-datadog-tags":"_dd.p.dm=-0"}}}',
              Timestamp: "2023-08-03T22:49:03.123Z",
              SignatureVersion: "1",
              Signature: "EXAMPLE",
              SigningCertUrl: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-123456789012.pem",
              Subject: undefined,
              UnsubscribeUrl: "https://sns.us-east-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-east-1:123456123456:my-topic:12345678-1234-1234-1234-123456789012",
              MessageAttributes: {}
            }
          }
        ]
      };

      const extractor = new EventBridgeSNSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-parent-id": "9876543210987654321",
        "x-datadog-sampling-priority": "1",
        "x-datadog-tags": "_dd.p.dm=-0",
        "x-datadog-trace-id": "1234567890123456789",
      });

      expect(traceContext?.toTraceId()).toBe("1234567890123456789");
      expect(traceContext?.toSpanId()).toBe("9876543210987654321");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it.each([
      ["Records", {}],
      ["Records first entry", { Records: [] }],
      ["Records first entry Sns", { Records: [{}] }],
      ["Records first entry Sns Message", { Records: [{ Sns: {} }] }],
      ["valid JSON in Message", { Records: [{ Sns: { Message: "{" } }] }], // JSON.parse should fail
      ["detail in Message", { Records: [{ Sns: { Message: "{}" } }] }],
      ["_datadog in detail", { Records: [{ Sns: { Message: '{"detail":{"text":"Hello, world!"}}' } }] }],
    ])("returns null and skips extracting when payload is missing '%s'", (_, payload) => {
      const tracerWrapper = new TracerWrapper();
      const extractor = new EventBridgeSNSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload as any);
      expect(traceContext).toBeNull();
    });

    it("returns null when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper();

      const payload = {
        Records: [
          {
            EventSource: "aws:sns",
            EventVersion: "1.0",
            EventSubscriptionArn: "arn:aws:sns:us-east-1:123456123456:my-topic:12345678-1234-1234-1234-123456789012",
            Sns: {
              Type: "Notification",
              MessageId: "12345678-1234-1234-1234-123456789012",
              TopicArn: "arn:aws:sns:us-east-1:123456123456:my-topic",
              // Message is missing _datadog
              Message: '{"version":"0","id":"12345678-1234-1234-1234-123456789012","detail-type":"my.Detail","source":"my.Source","account":"123456123456","time":"2023-08-03T22:49:03Z","region":"us-east-1","resources":[],"detail":{"text":"Hello, world!"}}',
              Timestamp: "2023-08-03T22:49:03.123Z",
              SignatureVersion: "1",
              Signature: "EXAMPLE",
              SigningCertUrl: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-123456789012.pem",
              Subject: undefined,
              UnsubscribeUrl: "https://sns.us-east-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-east-1:123456123456:my-topic:12345678-1234-1234-1234-123456789012",
              MessageAttributes: {}
            }
          }
        ]
      };

      const extractor = new EventBridgeSNSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload as SNSEvent);
      expect(traceContext).toBeNull();
    });

    it("extracts trace context from Step Function EventBridge-SNS event", () => {
      // Reset StepFunctionContextService instance
      StepFunctionContextService["_instance"] = undefined as any;

      const tracerWrapper = new TracerWrapper();

      const payload = {
        "Records": [
          {
            "EventSource": "aws:sns",
            "EventVersion": "1.0",
            "EventSubscriptionArn": "arn:aws:sns:sa-east-1:123456123456:rstrat-sfn-evb-sns-demo-dev-process-event-topic:8257bfde-3426-4901-9ace-6fbb180875b1",
            "Sns": {
              "Type": "Notification",
              "MessageId": "5d4b7d39-8b8d-5427-b7d9-1dc9e3d270aa",
              "TopicArn": "arn:aws:sns:sa-east-1:123456123456:rstrat-sfn-evb-sns-demo-dev-process-event-topic",
              "Message": "{\"version\":\"0\",\"id\":\"c967411c-9066-225e-1d37-527fed26f847\",\"detail-type\":\"ProcessEvent\",\"source\":\"demo.stepfunction\",\"account\":\"123456123456\",\"time\":\"2025-07-15T14:30:55Z\",\"region\":\"sa-east-1\",\"resources\":[\"arn:aws:states:sa-east-1:123456123456:stateMachine:rstrat-sfn-evb-sns-demo-dev-state-machine\",\"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-evb-sns-demo-dev-state-machine:test-execution-1752589852\"],\"detail\":{\"message\":\"Event from Step Functions\",\"timestamp\":\"2025-07-15T14:30:55.311Z\",\"executionName\":\"test-execution-1752589852\",\"stateMachineName\":\"rstrat-sfn-evb-sns-demo-dev-state-machine\",\"input\":{\"testData\":\"Hello from SNS integration\"},\"_datadog\":{\"Execution\":{\"Id\":\"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-evb-sns-demo-dev-state-machine:test-execution-1752589852\",\"StartTime\":\"2025-07-15T14:30:55.271Z\",\"Name\":\"test-execution-1752589852\",\"RoleArn\":\"arn:aws:iam::123456123456:role/rstrat-sfn-evb-sns-demo-d-StepFunctionsExecutionRol-5uB2zncEHF8x\",\"RedriveCount\":0},\"StateMachine\":{\"Id\":\"arn:aws:states:sa-east-1:123456123456:stateMachine:rstrat-sfn-evb-sns-demo-dev-state-machine\",\"Name\":\"rstrat-sfn-evb-sns-demo-dev-state-machine\"},\"State\":{\"Name\":\"PublishToEventBridge\",\"EnteredTime\":\"2025-07-15T14:30:55.311Z\",\"RetryCount\":0},\"RootExecutionId\":\"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-evb-sns-demo-dev-state-machine:test-execution-1752589852\",\"serverless-version\":\"v1\"}}}",
              "Timestamp": "2025-07-15T14:30:55.534Z",
              "SignatureVersion": "1",
              "Signature": "N+8rhLGKH/oj9wWBkvOrKHpH5icaWNxa68I0gmvxutTm+vBRZiT18GnncRR8yYPdrA6nNndb7PoNhzFdofNw3PhWx8GvaYNXQ41W4qBvM5fqg7XwrnS/+YBmmwI0Mq8uRq/+Uen/J0W8tBDxSmVkmZV8LiZceV113U/YQ8cZOorVUrbKQrCEG9c7+dydJLrFfJqT4sQ+yAxePC1ilme/OBpa2c8T9amnvuXvKRBDk2/uigvTLC9POC45p42q5jbweNzr3igXRHL20WDlR5fdqoKpZiELNeiUZKbA+caK73smQhtMUwY1vNmY8QghSSVGdOK6MgmalRsDAMF6GZRLEQ==",
              "SigningCertUrl": "https://sns.sa-east-1.amazonaws.com/SimpleNotificationService-9c6465fa7f48f5cacd23014631ec1136.pem",
              "Subject": undefined,
              "UnsubscribeUrl": "https://sns.sa-east-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:sa-east-1:123456123456:rstrat-sfn-evb-sns-demo-dev-process-event-topic:8257bfde-3426-4901-9ace-6fbb180875b1",
              "MessageAttributes": {}
            }
          }
        ]
      };

      const extractor = new EventBridgeSNSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      // The trace IDs are deterministically generated from the Step Function execution context
      expect(traceContext?.toTraceId()).toBe("2458939194637197377");
      expect(traceContext?.toSpanId()).toBe("6978708559187765983");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });
  });
});
