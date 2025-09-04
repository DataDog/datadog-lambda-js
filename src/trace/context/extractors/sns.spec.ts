import { SNSEvent } from "aws-lambda";
import { TracerWrapper } from "../../tracer-wrapper";
import { SNSEventTraceExtractor } from "./sns";
import { StepFunctionContextService } from "../../step-function-service";
import { TraceConfig } from "../../listener";
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

describe("SNSEventTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
      spyTracerWrapper.mockClear();
    });

    afterEach(() => {
      jest.resetModules();
    });

    it("extracts trace context with valid payload with String Value", () => {
      mockSpanContext = {
        toTraceId: () => "6966585609680374559",
        toSpanId: () => "4297634551783724228",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload: SNSEvent = {
        Records: [
          {
            EventSource: "aws:sns",
            EventVersion: "1.0",
            EventSubscriptionArn:
              "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
            Sns: {
              Type: "Notification",
              MessageId: "f19d39fa-8c61-5df9-8f49-639247b6cece",
              TopicArn: "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic",
              Subject: undefined,
              Message: '{"hello":"there","ajTimestamp":1643039127879}',
              Timestamp: "2022-01-24T15:45:27.968Z",
              SignatureVersion: "1",
              Signature:
                "mzp2Ou0fASw4LYRxY6SSww7qFfofn4luCJBRaTjLpQ5uhwhsAUKdyLz9VPD+/dlRbi1ImsWtIZ7A+wxj1oV7Z2Gyu/N4RpGalae37+jTluDS7AhjgcD7Bs4bgQtFkCfMFEwbhICQfukLLzbwbgczZ4NTPn6zj5o28c5NBKSJMYSnLz82ohw77GgnZ/m26E32ZQNW4+VCEMINg9Ne2rHstwPWRXPr5xGTrx8jH8CNUZnVpFVfhU8o+OSeAdpzm2l99grHIo7qPhekERxANz6QHynMlhdzD3UNSgc3oZkamZban/NEKd4MKJzgNQdNOYVj3Kw6eF2ZweEoBQ5sSFK5fQ==",
              SigningCertUrl:
                "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-************************33ab7e69.pem",
              UnsubscribeUrl:
                "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
              MessageAttributes: {
                _datadog: {
                  Type: "String",
                  Value:
                    '{"x-datadog-trace-id":"6966585609680374559","x-datadog-parent-id":"4297634551783724228","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
                },
              },
            },
          },
        ],
      };

      const extractor = new SNSEventTraceExtractor(tracerWrapper, {} as TraceConfig);

      const traceContext = extractor.extract(payload);
      expect(traceContext.length).toBe(1);

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-parent-id": "4297634551783724228",
        "x-datadog-sampled": "1",
        "x-datadog-sampling-priority": "1",
        "x-datadog-trace-id": "6966585609680374559",
      });

      expect(traceContext?.[0].toTraceId()).toBe("6966585609680374559");
      expect(traceContext?.[0].toSpanId()).toBe("4297634551783724228");
      expect(traceContext?.[0].sampleMode()).toBe("1");
      expect(traceContext?.[0].source).toBe("event");
    });

    it("extracts trace context with valid payload with Binary Value", () => {
      mockSpanContext = {
        toTraceId: () => "7102291628443134919",
        toSpanId: () => "4247550101648618618",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload: SNSEvent = {
        Records: [
          {
            EventSource: "aws:sns",
            EventVersion: "1.0",
            EventSubscriptionArn:
              "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
            Sns: {
              Type: "Notification",
              MessageId: "f19d39fa-8c61-5df9-8f49-639247b6cece",
              TopicArn: "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic",
              Subject: undefined,
              Message: '{"hello":"there","ajTimestamp":1643039127879}',
              Timestamp: "2022-01-24T15:45:27.968Z",
              SignatureVersion: "1",
              Signature:
                "mzp2Ou0fASw4LYRxY6SSww7qFfofn4luCJBRaTjLpQ5uhwhsAUKdyLz9VPD+/dlRbi1ImsWtIZ7A+wxj1oV7Z2Gyu/N4RpGalae37+jTluDS7AhjgcD7Bs4bgQtFkCfMFEwbhICQfukLLzbwbgczZ4NTPn6zj5o28c5NBKSJMYSnLz82ohw77GgnZ/m26E32ZQNW4+VCEMINg9Ne2rHstwPWRXPr5xGTrx8jH8CNUZnVpFVfhU8o+OSeAdpzm2l99grHIo7qPhekERxANz6QHynMlhdzD3UNSgc3oZkamZban/NEKd4MKJzgNQdNOYVj3Kw6eF2ZweEoBQ5sSFK5fQ==",
              SigningCertUrl:
                "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",
              UnsubscribeUrl:
                "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
              MessageAttributes: {
                _datadog: {
                  Type: "Binary",
                  Value:
                    "eyJ4LWRhdGFkb2ctdHJhY2UtaWQiOiI3MTAyMjkxNjI4NDQzMTM0OTE5IiwieC1kYXRhZG9nLXBhcmVudC1pZCI6IjQyNDc1NTAxMDE2NDg2MTg2MTgiLCJ4LWRhdGFkb2ctc2FtcGxpbmctcHJpb3JpdHkiOiIxIn0=",
                },
              },
            },
          },
        ],
      };

      const extractor = new SNSEventTraceExtractor(tracerWrapper, {} as TraceConfig);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-parent-id": "4247550101648618618",
        "x-datadog-sampling-priority": "1",
        "x-datadog-trace-id": "7102291628443134919",
      });

      expect(traceContext?.[0].toTraceId()).toBe("7102291628443134919");
      expect(traceContext?.[0].toSpanId()).toBe("4247550101648618618");
      expect(traceContext?.[0].sampleMode()).toBe("1");
      expect(traceContext?.[0].source).toBe("event");
    });


    it("only extracts first trace context with multiple input payloads", () => {
      mockSpanContext = {
        toTraceId: () => "6966585609680374559",
        toSpanId: () => "4297634551783724228",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload: SNSEvent = {
        Records: [
          {
            EventSource: "aws:sns",
            EventVersion: "1.0",
            EventSubscriptionArn:
              "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
            Sns: {
              Type: "Notification",
              MessageId: "f19d39fa-8c61-5df9-8f49-639247b6cece",
              TopicArn: "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic",
              Subject: undefined,
              Message: '{"hello":"there","ajTimestamp":1643039127879}',
              Timestamp: "2022-01-24T15:45:27.968Z",
              SignatureVersion: "1",
              Signature:
                "mzp2Ou0fASw4LYRxY6SSww7qFfofn4luCJBRaTjLpQ5uhwhsAUKdyLz9VPD+/dlRbi1ImsWtIZ7A+wxj1oV7Z2Gyu/N4RpGalae37+jTluDS7AhjgcD7Bs4bgQtFkCfMFEwbhICQfukLLzbwbgczZ4NTPn6zj5o28c5NBKSJMYSnLz82ohw77GgnZ/m26E32ZQNW4+VCEMINg9Ne2rHstwPWRXPr5xGTrx8jH8CNUZnVpFVfhU8o+OSeAdpzm2l99grHIo7qPhekERxANz6QHynMlhdzD3UNSgc3oZkamZban/NEKd4MKJzgNQdNOYVj3Kw6eF2ZweEoBQ5sSFK5fQ==",
              SigningCertUrl:
                "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-************************33ab7e69.pem",
              UnsubscribeUrl:
                "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
              MessageAttributes: {
                _datadog: {
                  Type: "String",
                  Value:
                    '{"x-datadog-trace-id":"6966585609680374559","x-datadog-parent-id":"4297634551783724228","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
                },
              },
            },
          },
          {
            EventSource: "aws:sns",
            EventVersion: "1.0",
            EventSubscriptionArn:
              "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
            Sns: {
              Type: "Notification",
              MessageId: "f19d39fa-8c61-5df9-8f49-639247b6cece",
              TopicArn: "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic",
              Subject: undefined,
              Message: '{"hello":"there","ajTimestamp":1643039127879}',
              Timestamp: "2022-01-24T15:45:27.968Z",
              SignatureVersion: "1",
              Signature:
                "mzp2Ou0fASw4LYRxY6SSww7qFfofn4luCJBRaTjLpQ5uhwhsAUKdyLz9VPD+/dlRbi1ImsWtIZ7A+wxj1oV7Z2Gyu/N4RpGalae37+jTluDS7AhjgcD7Bs4bgQtFkCfMFEwbhICQfukLLzbwbgczZ4NTPn6zj5o28c5NBKSJMYSnLz82ohw77GgnZ/m26E32ZQNW4+VCEMINg9Ne2rHstwPWRXPr5xGTrx8jH8CNUZnVpFVfhU8o+OSeAdpzm2l99grHIo7qPhekERxANz6QHynMlhdzD3UNSgc3oZkamZban/NEKd4MKJzgNQdNOYVj3Kw6eF2ZweEoBQ5sSFK5fQ==",
              SigningCertUrl:
                "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-************************33ab7e69.pem",
              UnsubscribeUrl:
                "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
              MessageAttributes: {
                _datadog: {
                  Type: "String",
                  Value:
                    '{"x-datadog-trace-id":"6966585609680374559","x-datadog-parent-id":"4297634551783724228","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
                },
              },
            },
          },
        ],
      };

      const extractor = new SNSEventTraceExtractor(tracerWrapper, {} as TraceConfig);

      const traceContext = extractor.extract(payload);
      expect(traceContext.length).toBe(1);

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-parent-id": "4297634551783724228",
        "x-datadog-sampled": "1",
        "x-datadog-sampling-priority": "1",
        "x-datadog-trace-id": "6966585609680374559",
      });

      expect(traceContext?.[0].toTraceId()).toBe("6966585609680374559");
      expect(traceContext?.[0].toSpanId()).toBe("4297634551783724228");
      expect(traceContext?.[0].sampleMode()).toBe("1");
      expect(traceContext?.[0].source).toBe("event");
    });

    it("extract all trace contexts when span links is enabled", () => {
      mockSpanContext = {
        toTraceId: () => "6966585609680374559",
        toSpanId: () => "4297634551783724228",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload: SNSEvent = {
        Records: [
          {
            EventSource: "aws:sns",
            EventVersion: "1.0",
            EventSubscriptionArn:
              "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
            Sns: {
              Type: "Notification",
              MessageId: "f19d39fa-8c61-5df9-8f49-639247b6cece",
              TopicArn: "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic",
              Subject: undefined,
              Message: '{"hello":"there","ajTimestamp":1643039127879}',
              Timestamp: "2022-01-24T15:45:27.968Z",
              SignatureVersion: "1",
              Signature:
                "mzp2Ou0fASw4LYRxY6SSww7qFfofn4luCJBRaTjLpQ5uhwhsAUKdyLz9VPD+/dlRbi1ImsWtIZ7A+wxj1oV7Z2Gyu/N4RpGalae37+jTluDS7AhjgcD7Bs4bgQtFkCfMFEwbhICQfukLLzbwbgczZ4NTPn6zj5o28c5NBKSJMYSnLz82ohw77GgnZ/m26E32ZQNW4+VCEMINg9Ne2rHstwPWRXPr5xGTrx8jH8CNUZnVpFVfhU8o+OSeAdpzm2l99grHIo7qPhekERxANz6QHynMlhdzD3UNSgc3oZkamZban/NEKd4MKJzgNQdNOYVj3Kw6eF2ZweEoBQ5sSFK5fQ==",
              SigningCertUrl:
                "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-************************33ab7e69.pem",
              UnsubscribeUrl:
                "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
              MessageAttributes: {
                _datadog: {
                  Type: "String",
                  Value:
                    '{"x-datadog-trace-id":"6966585609680374559","x-datadog-parent-id":"4297634551783724228","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
                },
              },
            },
          },
          {
            EventSource: "aws:sns",
            EventVersion: "1.0",
            EventSubscriptionArn:
              "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
            Sns: {
              Type: "Notification",
              MessageId: "f19d39fa-8c61-5df9-8f49-639247b6cece",
              TopicArn: "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic",
              Subject: undefined,
              Message: '{"hello":"there","ajTimestamp":1643039127879}',
              Timestamp: "2022-01-24T15:45:27.968Z",
              SignatureVersion: "1",
              Signature:
                "mzp2Ou0fASw4LYRxY6SSww7qFfofn4luCJBRaTjLpQ5uhwhsAUKdyLz9VPD+/dlRbi1ImsWtIZ7A+wxj1oV7Z2Gyu/N4RpGalae37+jTluDS7AhjgcD7Bs4bgQtFkCfMFEwbhICQfukLLzbwbgczZ4NTPn6zj5o28c5NBKSJMYSnLz82ohw77GgnZ/m26E32ZQNW4+VCEMINg9Ne2rHstwPWRXPr5xGTrx8jH8CNUZnVpFVfhU8o+OSeAdpzm2l99grHIo7qPhekERxANz6QHynMlhdzD3UNSgc3oZkamZban/NEKd4MKJzgNQdNOYVj3Kw6eF2ZweEoBQ5sSFK5fQ==",
              SigningCertUrl:
                "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-************************33ab7e69.pem",
              UnsubscribeUrl:
                "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
              MessageAttributes: {
                _datadog: {
                  Type: "String",
                  Value:
                    '{"x-datadog-trace-id":"6966585609680374559","x-datadog-parent-id":"4297634551783724228","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
                },
              },
            },
          },
        ],
      };

      const extractor = new SNSEventTraceExtractor(tracerWrapper, {useSpanLinks: true} as TraceConfig);

      const traceContext = extractor.extract(payload);

      expect(traceContext?.length).toBe(2);
    });

    it.each([
      ["Records", {}],
      ["Records first entry", { Records: [] }],
      ["Records first entry Sns", { Records: [{}] }],
      ["MessageAttributes in Sns", { Records: [{ Sns: "{}" }] }],
      ["_datadog in MessageAttributes", { Records: [{ Sns: '{"MessageAttributes":{"text":"Hello, world!"}}' }] }],
      ["Value in _datadog", { Records: [{ Sns: '{"MessageAttributes":{"_datadog":{}}}' }] }],
    ])("returns an empty array and skips extracting when payload is missing '%s'", (_, payload) => {
      const tracerWrapper = new TracerWrapper();
      const extractor = new SNSEventTraceExtractor(tracerWrapper, {} as TraceConfig);

      const traceContext = extractor.extract(payload as any);
      expect(traceContext).toStrictEqual([]);
    });

    it("returns an empty array when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper();

      const payload: SNSEvent = {
        Records: [
          {
            EventSource: "aws:sns",
            EventVersion: "1.0",
            EventSubscriptionArn:
              "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
            Sns: {
              Type: "Notification",
              MessageId: "f19d39fa-8c61-5df9-8f49-639247b6cece",
              TopicArn: "arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic",
              Subject: undefined,
              Message: '{"hello":"there","ajTimestamp":1643039127879}',
              Timestamp: "2022-01-24T15:45:27.968Z",
              SignatureVersion: "1",
              Signature:
                "mzp2Ou0fASw4LYRxY6SSww7qFfofn4luCJBRaTjLpQ5uhwhsAUKdyLz9VPD+/dlRbi1ImsWtIZ7A+wxj1oV7Z2Gyu/N4RpGalae37+jTluDS7AhjgcD7Bs4bgQtFkCfMFEwbhICQfukLLzbwbgczZ4NTPn6zj5o28c5NBKSJMYSnLz82ohw77GgnZ/m26E32ZQNW4+VCEMINg9Ne2rHstwPWRXPr5xGTrx8jH8CNUZnVpFVfhU8o+OSeAdpzm2l99grHIo7qPhekERxANz6QHynMlhdzD3UNSgc3oZkamZban/NEKd4MKJzgNQdNOYVj3Kw6eF2ZweEoBQ5sSFK5fQ==",
              SigningCertUrl:
                "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",
              UnsubscribeUrl:
                "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:eu-west-1:601427279990:aj-js-library-test-dev-solo-topic:1bd19208-a99a-46d9-8398-f90f8699c641",
              MessageAttributes: {
                _datadog: {
                  Type: "String",
                  Value: "{}",
                },
              },
            },
          },
        ],
      };

      const extractor = new SNSEventTraceExtractor(tracerWrapper, {} as TraceConfig);

      const traceContext = extractor.extract(payload);
      expect(traceContext).toStrictEqual([]);
    });

    it("extracts trace context from AWSTraceHeader when no tracecontext found from payload", () => {
      const tracerWrapper = new TracerWrapper();
      const payload: SNSEvent = {
        Records: [
          {
            EventSource: "aws:sns",
            EventVersion: "1.0",
            EventSubscriptionArn:
              "arn:aws:sns:us-west-2:425362996713:DdTraceXLambda-snsjavachecksNestedStacksnsjavachecksNestedStackResource569D7DFD-VGBRIQ3RKOFR-snsJavaProducer2snsjavaproducerforPythontopic2EDA1CA9-A4bHj7LHgBQh:f3864261-c160-443d-b21e-8effb1899456",
            Sns: {
              Type: "Notification",
              MessageId: "f0cae95c-225d-5718-896c-b7ef1e3a7108",
              TopicArn:
                "arn:aws:sns:us-west-2:425362996713:DdTraceXLambda-snsjavachecksNestedStacksnsjavachecksNestedStackResource569D7DFD-VGBRIQ3RKOFR-snsJavaProducer2snsjavaproducerforPythontopic2EDA1CA9-A4bHj7LHgBQh",
              Subject: "",
              Message: "hello from DdTraceXLambda-snsjavache-snsjavaproducerforPython-f1dKTIyh8pN6",
              Timestamp: "2024-05-06T20:14:31.519Z",
              SignatureVersion: "1",
              Signature:
                "gkBg+e7h+DSrgXzehe+rWCJmH0UWXwsaAz/dnngWivJmYKbdH0pNHNpM0ttFko2OItYzDEE+DdEm9dfSF7MYzl36UaFpijr1VI6YIwRcYAy6wpwwV23uX1XD7PrIoE/4/bonL6WJQLhdKiO3SD4eKd1RoIk4e1SjDzfMUtz6/4UaXC56wwQ/mj9QwglZ867xM0icLJjyT2LWIrIkHjyXFNFrQUn973sRcgfZDs92kOfacF0/Zqm6I/pHzoDeoQU4MapuX8jWSA45bPjxtWXglpez0z7Yne4eLujPSSEwzJRyPJeRaxdyL1NFF43X0SAZ5C7gWgeExN7GJKs1zW2sFA==",
              SigningCertUrl:
                "https://sns.us-west-2.amazonaws.com/SimpleNotificationService-************************33ab7e69",
              UnsubscribeUrl:
                "https://sns.us-west-2.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-west-2:425362996713:DdTraceXLambda-snsjavachecksNestedStacksnsjavachecksNestedStackResource569D7DFD-VGBRIQ3RKOFR-snsJavaProducer2snsjavaproducerforPythontopic2EDA1CA9-A4bHj7LHgBQh:f3864261-c160-443d-b21e-8effb1899456",
              MessageAttributes: {
                test: {
                  Type: "String",
                  Value: "test",
                },
              },
            },
          },
        ],
      };

      const extractor = new SNSEventTraceExtractor(tracerWrapper, {} as TraceConfig);
      process.env["_X_AMZN_TRACE_ID"] =
        "Root=1-66393a26-0000000017acacbad335fb99;Parent=12f5e70cc905dfb7;Sampled=1;Lineage=48e79d5f:0";
      const traceContext = extractor.extract(payload);
      process.env["_X_AMZN_TRACE_ID"] = "";
      expect(traceContext).not.toBeNull();

      // Should not use ddtracer extractor. Because 1. it's an unnecessary extra step and
      // 2. More importantly, DD_TRACE_PROPAGATION_STYLE could cause extraction fail
      expect(spyTracerWrapper).not.toHaveBeenCalled();

      expect(traceContext?.[0].toTraceId()).toBe("1705928277274000281");
      expect(traceContext?.[0].toSpanId()).toBe("1366252104075042743");
      expect(traceContext?.[0].sampleMode()).toBe("1");
      expect(traceContext?.[0].source).toBe("event");
    });

    it("extracts trace context from Step Function SNS event", () => {
      // Reset StepFunctionContextService instance
      StepFunctionContextService["_instance"] = undefined as any;

      const tracerWrapper = new TracerWrapper();

      const payload: SNSEvent = {
        Records: [
          {
            EventSource: "aws:sns",
            EventVersion: "1.0",
            EventSubscriptionArn:
              "arn:aws:sns:sa-east-1:123456123456:rstrat-sfn-sns-demo-dev-process-event-topic:f18241f8-a4f7-4586-80db-97bd1939a557",
            Sns: {
              Type: "Notification",
              MessageId: "46d2665c-7ee2-50ba-a4cd-06acf35f5d5f",
              TopicArn: "arn:aws:sns:sa-east-1:123456123456:rstrat-sfn-sns-demo-dev-process-event-topic",
              Message:
                '{"source":"demo.stepfunction","detailType":"ProcessEvent","message":"Test event from Step Functions","customData":{"userId":"12345","action":"test"}}',
              Timestamp: "2025-07-15T17:10:21.503Z",
              SignatureVersion: "1",
              Signature:
                "fHeJta0GWCs/lHhI6wesXiT+66i1SZ+XH58pyd8mKHKD8bepXsnWvfQdDsOkO2AVv2CqPBF58sAWQae6yob2aMawe/vo8eeahJCaguK8a/3HLj7kP+nXGjgSGvzQm4CdYEyAUco453/mfE/BSf0SkdctxW0rjMs27T2l964Lt2Y/vJeiXVibs/AqEIu3ImekbM8+EIfNMOLBdRBVE47650vawazMkcpPtg5o/8LCA/jNUNj9VCTJrvzep8/vVJEcuHbZ3pcmajA9UJmP3000G0+to0cXwZ5YaakOxQTv81I+cfC99yQJoogLklbgiu+4bqEeNWbwW9KdQz1U+79NgA==",
              SigningCertUrl:
                "https://sns.sa-east-1.amazonaws.com/SimpleNotificationService-9c6465fa7f48f5cacd23014631ec1136.pem",
              Subject: "Event from Step Functions",
              UnsubscribeUrl:
                "https://sns.sa-east-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:sa-east-1:123456123456:rstrat-sfn-sns-demo-dev-process-event-topic:f18241f8-a4f7-4586-80db-97bd1939a557",
              MessageAttributes: {
                _datadog: {
                  Type: "String",
                  Value:
                    '{"Execution":{"Id":"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-sns-demo-dev-state-machine:79049e80-5cc6-49da-9dc0-f19ba2921772","StartTime":"2025-07-15T17:10:21.328Z","Name":"79049e80-5cc6-49da-9dc0-f19ba2921772","RoleArn":"arn:aws:iam::123456123456:role/rstrat-sfn-sns-demo-dev-StepFunctionsExecutionRole-LrsdDm6wMmBh","RedriveCount":0},"StateMachine":{"Id":"arn:aws:states:sa-east-1:123456123456:stateMachine:rstrat-sfn-sns-demo-dev-state-machine","Name":"rstrat-sfn-sns-demo-dev-state-machine"},"State":{"Name":"PublishToSNS","EnteredTime":"2025-07-15T17:10:21.354Z","RetryCount":0},"RootExecutionId":"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-sns-demo-dev-state-machine:79049e80-5cc6-49da-9dc0-f19ba2921772","serverless-version":"v1"}',
                },
              },
            },
          },
        ],
      };

      const extractor = new SNSEventTraceExtractor(tracerWrapper, {} as TraceConfig);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      // The StepFunctionContextService generates deterministic trace IDs
      expect(traceContext?.[0].toTraceId()).toBe("3995810302240690842");
      expect(traceContext?.[0].toSpanId()).toBe("8347071195300897803");
      expect(traceContext?.[0].sampleMode()).toBe("1");
      expect(traceContext?.[0].source).toBe("event");
    });
  });
});
