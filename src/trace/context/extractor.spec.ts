import { Context, EventBridgeEvent, KinesisStreamEvent, SNSEvent, SQSEvent } from "aws-lambda";
import { TraceConfig } from "../listener";
import { TracerWrapper } from "../tracer-wrapper";
import {
  DATADOG_PARENT_ID_HEADER,
  DATADOG_SAMPLING_PRIORITY_HEADER,
  DATADOG_TRACE_ID_HEADER,
  TraceContextExtractor,
} from "./extractor";
import { TraceSource } from "../trace-context-service";
import {
  AppSyncEventTraceExtractor,
  EventBridgeEventTraceExtractor,
  EventBridgeSQSEventTraceExtractor,
  HTTPEventTraceExtractor,
  KinesisEventTraceExtractor,
  SNSEventTraceExtractor,
  SNSSQSEventTraceExtractor,
  SQSEventTraceExtractor,
  StepFunctionEventTraceExtractor,
} from "./extractors";
import { StepFunctionContextService } from "../step-function-service";
import { SpanContextWrapper } from "../span-context-wrapper";

let mockSpanContext: any = null;
let sentSegment: any;
let closedSocket = false;

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

jest.mock("dgram", () => ({
  createSocket: () => {
    return {
      send: (
        message: string,
        start: number,
        length: number,
        port: number,
        address: string,
        callback: (error: string | undefined, bytes: number) => void,
      ) => {
        sentSegment = message;
        callback(undefined, 1);
      },
      close: () => {
        closedSocket = true;
      },
    };
  },
}));

jest.mock("crypto", () => {
  return {
    randomBytes: () => "11111",
  };
});

const spyTracerWrapper = jest.spyOn(TracerWrapper.prototype, "extract");

describe("TraceContextExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
      StepFunctionContextService["_instance"] = undefined as any;
    });

    afterEach(() => {
      jest.resetModules();
      process.env["_X_AMZN_TRACE_ID"] = undefined;
    });

    describe("custom extractor", () => {
      it.each([
        [
          "async",
          {
            traceExtractor: async (event: any, _context: Context) => {
              const traceId = event.foo[DATADOG_TRACE_ID_HEADER];
              const parentId = event.foo[DATADOG_PARENT_ID_HEADER];
              const samplingPriority = event.foo[DATADOG_SAMPLING_PRIORITY_HEADER];
              const sampleMode = parseInt(samplingPriority, 10);

              return {
                parentId,
                sampleMode,
                source: TraceSource.Event,
                traceId,
              };
            },
          },
        ],
        [
          "sync",
          {
            traceExtractor: (event: any, _context: Context) => {
              const traceId = event.foo[DATADOG_TRACE_ID_HEADER];
              const parentId = event.foo[DATADOG_PARENT_ID_HEADER];
              const samplingPriority = event.foo[DATADOG_SAMPLING_PRIORITY_HEADER];
              const sampleMode = parseInt(samplingPriority, 10);

              return {
                parentId,
                sampleMode,
                source: TraceSource.Event,
                traceId,
              };
            },
          },
        ],
      ])("extracts trace context from custom extractor - %s", async (_, tracerConfig) => {
        const spyCustomExtractor = jest.spyOn(tracerConfig, "traceExtractor");

        const event = {
          foo: {
            "x-datadog-parent-id": "797643193680388251",
            "x-datadog-sampling-priority": "2",
            "x-datadog-trace-id": "4110911582297405551",
          },
          // these should be ignored
          headers: {
            "x-datadog-parent-id": "111143193680388251",
            "x-datadog-sampling-priority": "1",
            "x-datadog-trace-id": "1111911582297405551",
          },
        };

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, tracerConfig as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
        expect(traceContext).not.toBeNull();

        expect(spyCustomExtractor).toHaveBeenCalled();

        expect(traceContext?.toTraceId()).toBe("4110911582297405551");
        expect(traceContext?.toSpanId()).toBe("797643193680388251");
        expect(traceContext?.sampleMode()).toBe("2");
        expect(traceContext?.source).toBe("event");
      });
    });
    describe("event", () => {
      beforeEach(() => {
        StepFunctionContextService["_instance"] = undefined as any;
      });
      // HTTP event
      it("extracts trace context from HTTP headers", async () => {
        mockSpanContext = {
          toTraceId: () => "4110911582297405551",
          toSpanId: () => "797643193680388251",
          _sampling: {
            priority: "2",
          },
        };
        const event = {
          headers: {
            "x-datadog-parent-id": "797643193680388251",
            "x-datadog-sampling-priority": "2",
            "x-datadog-trace-id": "4110911582297405551",
          },
        };

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
        expect(traceContext).not.toBeNull();

        expect(spyTracerWrapper).toHaveBeenCalledWith({
          "x-datadog-parent-id": "797643193680388251",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "4110911582297405551",
        });

        expect(traceContext?.toTraceId()).toBe("4110911582297405551");
        expect(traceContext?.toSpanId()).toBe("797643193680388251");
        expect(traceContext?.sampleMode()).toBe("2");
        expect(traceContext?.source).toBe("event");
      });

      // SNS message event (String Value)
      it("extracts trace context from SNS event - String Value", async () => {
        mockSpanContext = {
          toTraceId: () => "6966585609680374559",
          toSpanId: () => "4297634551783724228",
          _sampling: {
            priority: "1",
          },
        };

        const event: SNSEvent = {
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
                    Value:
                      '{"x-datadog-trace-id":"6966585609680374559","x-datadog-parent-id":"4297634551783724228","x-datadog-sampled":"1","x-datadog-sampling-priority":"1"}',
                  },
                },
              },
            },
          ],
        };

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
        expect(traceContext).not.toBeNull();

        expect(spyTracerWrapper).toHaveBeenCalledWith({
          "x-datadog-parent-id": "4297634551783724228",
          "x-datadog-sampled": "1",
          "x-datadog-sampling-priority": "1",
          "x-datadog-trace-id": "6966585609680374559",
        });

        expect(traceContext?.toTraceId()).toBe("6966585609680374559");
        expect(traceContext?.toSpanId()).toBe("4297634551783724228");
        expect(traceContext?.sampleMode()).toBe("1");
        expect(traceContext?.source).toBe("event");
      });

      // SNS message event (Binary Value)
      it("extracts trace context from SNS event - Binary Value", async () => {
        mockSpanContext = {
          toTraceId: () => "7102291628443134919",
          toSpanId: () => "4247550101648618618",
          _sampling: {
            priority: "1",
          },
        };

        const event: SNSEvent = {
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

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
        expect(traceContext).not.toBeNull();

        expect(spyTracerWrapper).toHaveBeenCalledWith({
          "x-datadog-parent-id": "4247550101648618618",
          "x-datadog-sampling-priority": "1",
          "x-datadog-trace-id": "7102291628443134919",
        });

        expect(traceContext?.toTraceId()).toBe("7102291628443134919");
        expect(traceContext?.toSpanId()).toBe("4247550101648618618");
        expect(traceContext?.sampleMode()).toBe("1");
        expect(traceContext?.source).toBe("event");
      });

      // SNS message delivered to SQS queue event (String Value)
      it("extracts trace context from SNS to SQS event - String Value", async () => {
        mockSpanContext = {
          toTraceId: () => "2776434475358637757",
          toSpanId: () => "4493917105238181843",
          _sampling: {
            priority: "1",
          },
        };

        const event: SQSEvent = {
          Records: [
            {
              messageId: "64812b68-4d9b-4dca-b3fb-9b18f255ee51",
              receiptHandle:
                "AQEBER6aRkfG8092GvkL7FRwCwbQ7LLDW9Tlk/CembqHe+suS2kfFxXiukomvaIN61QoyQMoRgWuV52SDkiQno2u+5hP64BDbmw+e/KR9ayvIfHJ3M6RfyQLaWNWm3hDFBCKTnBMVIxtdx0N9epZZewyokjKcrNYtmCghFgTCvZzsQkowi5rnoHAVHJ3je1c3bDnQ1KLrZFgajDnootYXDwEPuMq5FIxrf4EzTe0S7S+rnRm+GaQfeBLBVAY6dASL9usV3/AFRqDtaI7GKI+0F2NCgLlqj49VlPRz4ldhkGknYlKTZTluAqALWLJS62/J1GQo53Cs3nneJcmu5ajB2zzmhhRXoXINEkLhCD5ujZfcsw9H4xqW69Or4ECvlqx14bUU2rtMIW0QM2p7pEeXnyocymQv6m1te113eYWTVmaJ4I=",
              body: '{\n  "Type" : "Notification",\n  "MessageId" : "0a0ab23e-4861-5447-82b7-e8094ff3e332",\n  "TopicArn" : "arn:aws:sns:eu-west-1:601427279990:js-library-test-dev-demoTopic-15WGUVRCBMPAA",\n  "Message" : "{\\"hello\\":\\"harv\\",\\"nice of you to join us\\":\\"david\\",\\"anotherThing\\":{\\"foo\\":\\"bar\\",\\"blah\\":null,\\"harv\\":123},\\"vals\\":[{\\"thingOne\\":1},{\\"thingTwo\\":2}],\\"ajTimestamp\\":1639777617957}",\n  "Timestamp" : "2021-12-17T21:46:58.040Z",\n  "SignatureVersion" : "1",\n  "Signature" : "FR35/7E8C3LHEVk/rC4XxXlXwV/5mNkFNPgDhHSnJ2I6hIoSrTROAm7h5xm1PuBkAeFDvq0zofw91ouk9zZyvhdrMLFIIgrjEyNayRmEffmoEAkzLFUsgtQX7MmTl644r4NuWiM0Oiz7jueRvIcKXcZr7Nc6GJcWV1ymec8oOmuHNMisnPMxI07LIQVYSyAfv6P9r2jEWMVIukRoCzwTnRk4bUUYhPSGHI7OC3AsxxXBbv8snqTrLM/4z2rXCf6jHCKNxWeLlm9/45PphCkEyx5BWS4/71KaoMWUWy8+6CCsy+uF3XTCVmvSEYLyEwTSzOY+vCUjazrRW93498i70g==",\n  "SigningCertUrl" : "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",\n  "UnsubscribeUrl" : "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:eu-west-1:601427279990:js-library-test-dev-demoTopic-15WGUVRCBMPAA:1290f550-9a8a-4e8f-a900-8f5f96dcddda",\n  "MessageAttributes" : {\n    "_datadog" : {"Type":"String","Value":"{\\"x-datadog-trace-id\\":\\"2776434475358637757\\",\\"x-datadog-parent-id\\":\\"4493917105238181843\\",\\"x-datadog-sampled\\":\\"1\\",\\"x-datadog-sampling-priority\\":\\"1\\"}"}\n  }\n}',
              attributes: {
                ApproximateReceiveCount: "1",
                SentTimestamp: "1639777618130",
                SenderId: "AIDAIOA2GYWSHW4E2VXIO",
                ApproximateFirstReceiveTimestamp: "1639777618132",
              },
              messageAttributes: {},
              md5OfBody: "ee19d8b1377919239ad3fd5dabc33739",
              eventSource: "aws:sqs",
              eventSourceARN: "arn:aws:sqs:eu-west-1:601427279990:aj-js-library-test-dev-demo-queue",
              awsRegion: "eu-west-1",
            },
          ],
        };

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
        expect(traceContext).not.toBeNull();

        expect(spyTracerWrapper).toHaveBeenCalledWith({
          "x-datadog-parent-id": "4493917105238181843",
          "x-datadog-sampled": "1",
          "x-datadog-sampling-priority": "1",
          "x-datadog-trace-id": "2776434475358637757",
        });

        expect(traceContext?.toTraceId()).toBe("2776434475358637757");
        expect(traceContext?.toSpanId()).toBe("4493917105238181843");
        expect(traceContext?.sampleMode()).toBe("1");
        expect(traceContext?.source).toBe("event");
      });

      // SNS message delivered to SQS queue event (Binary Value)
      it("extracts trace context from SNS to SQS event - Binary Value", async () => {
        mockSpanContext = {
          toTraceId: () => "7102291628443134919",
          toSpanId: () => "4247550101648618618",
          _sampling: {
            priority: "1",
          },
        };

        const event: SQSEvent = {
          Records: [
            {
              messageId: "64812b68-4d9b-4dca-b3fb-9b18f255ee51",
              receiptHandle:
                "AQEBER6aRkfG8092GvkL7FRwCwbQ7LLDW9Tlk/CembqHe+suS2kfFxXiukomvaIN61QoyQMoRgWuV52SDkiQno2u+5hP64BDbmw+e/KR9ayvIfHJ3M6RfyQLaWNWm3hDFBCKTnBMVIxtdx0N9epZZewyokjKcrNYtmCghFgTCvZzsQkowi5rnoHAVHJ3je1c3bDnQ1KLrZFgajDnootYXDwEPuMq5FIxrf4EzTe0S7S+rnRm+GaQfeBLBVAY6dASL9usV3/AFRqDtaI7GKI+0F2NCgLlqj49VlPRz4ldhkGknYlKTZTluAqALWLJS62/J1GQo53Cs3nneJcmu5ajB2zzmhhRXoXINEkLhCD5ujZfcsw9H4xqW69Or4ECvlqx14bUU2rtMIW0QM2p7pEeXnyocymQv6m1te113eYWTVmaJ4I=",
              body: '{\n  "Type" : "Notification",\n  "MessageId" : "0a0ab23e-4861-5447-82b7-e8094ff3e332",\n  "TopicArn" : "arn:aws:sns:eu-west-1:601427279990:js-library-test-dev-demoTopic-15WGUVRCBMPAA",\n  "Message" : "{\\"hello\\":\\"harv\\",\\"nice of you to join us\\":\\"david\\",\\"anotherThing\\":{\\"foo\\":\\"bar\\",\\"blah\\":null,\\"harv\\":123},\\"vals\\":[{\\"thingOne\\":1},{\\"thingTwo\\":2}],\\"ajTimestamp\\":1639777617957}",\n  "Timestamp" : "2021-12-17T21:46:58.040Z",\n  "SignatureVersion" : "1",\n  "Signature" : "FR35/7E8C3LHEVk/rC4XxXlXwV/5mNkFNPgDhHSnJ2I6hIoSrTROAm7h5xm1PuBkAeFDvq0zofw91ouk9zZyvhdrMLFIIgrjEyNayRmEffmoEAkzLFUsgtQX7MmTl644r4NuWiM0Oiz7jueRvIcKXcZr7Nc6GJcWV1ymec8oOmuHNMisnPMxI07LIQVYSyAfv6P9r2jEWMVIukRoCzwTnRk4bUUYhPSGHI7OC3AsxxXBbv8snqTrLM/4z2rXCf6jHCKNxWeLlm9/45PphCkEyx5BWS4/71KaoMWUWy8+6CCsy+uF3XTCVmvSEYLyEwTSzOY+vCUjazrRW93498i70g==",\n  "SigningCertUrl" : "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",\n  "UnsubscribeUrl" : "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:eu-west-1:601427279990:js-library-test-dev-demoTopic-15WGUVRCBMPAA:1290f550-9a8a-4e8f-a900-8f5f96dcddda",\n  "MessageAttributes" : {\n    "_datadog" : {"Type":"Binary","Value":"eyJ4LWRhdGFkb2ctdHJhY2UtaWQiOiI3MTAyMjkxNjI4NDQzMTM0OTE5IiwieC1kYXRhZG9nLXBhcmVudC1pZCI6IjQyNDc1NTAxMDE2NDg2MTg2MTgiLCJ4LWRhdGFkb2ctc2FtcGxpbmctcHJpb3JpdHkiOiIxIn0="}\n  }\n}',
              attributes: {
                ApproximateReceiveCount: "1",
                SentTimestamp: "1639777618130",
                SenderId: "AIDAIOA2GYWSHW4E2VXIO",
                ApproximateFirstReceiveTimestamp: "1639777618132",
              },
              messageAttributes: {},
              md5OfBody: "ee19d8b1377919239ad3fd5dabc33739",
              eventSource: "aws:sqs",
              eventSourceARN: "arn:aws:sqs:eu-west-1:601427279990:aj-js-library-test-dev-demo-queue",
              awsRegion: "eu-west-1",
            },
          ],
        };

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
        expect(traceContext).not.toBeNull();

        expect(spyTracerWrapper).toHaveBeenCalledWith({
          "x-datadog-parent-id": "4247550101648618618",
          "x-datadog-sampling-priority": "1",
          "x-datadog-trace-id": "7102291628443134919",
        });

        expect(traceContext?.toTraceId()).toBe("7102291628443134919");
        expect(traceContext?.toSpanId()).toBe("4247550101648618618");
        expect(traceContext?.sampleMode()).toBe("1");
        expect(traceContext?.source).toBe("event");
      });

      // EventBridge message delivered to SQS queue event
      it("extracts trace context from EventBridge to SQS event", async () => {
        mockSpanContext = {
          toTraceId: () => "7379586022458917877",
          toSpanId: () => "2644033662113726488",
          _sampling: {
            priority: "1",
          },
        };

        const event: SQSEvent = {
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

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
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

      // AppSync event
      it("extracts trace context from AppSync event", async () => {
        mockSpanContext = {
          toTraceId: () => "797643193680388254",
          toSpanId: () => "4110911582297405557",
          _sampling: {
            priority: "2",
          },
        };
        const event = {
          info: {
            selectionSetGraphQL: "{ items }",
          },
          request: {
            headers: {
              "x-datadog-parent-id": "797643193680388254",
              "x-datadog-sampling-priority": "2",
              "x-datadog-trace-id": "4110911582297405557",
            },
          },
        };

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
        expect(traceContext).not.toBeNull();

        expect(spyTracerWrapper).toHaveBeenCalledWith({
          "x-datadog-parent-id": "797643193680388254",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "4110911582297405557",
        });

        expect(traceContext?.toTraceId()).toBe("797643193680388254");
        expect(traceContext?.toSpanId()).toBe("4110911582297405557");
        expect(traceContext?.sampleMode()).toBe("2");
        expect(traceContext?.source).toBe("event");
      });

      // SQS queue message event
      it("extracts trace context from SQS event", async () => {
        mockSpanContext = {
          toTraceId: () => "4555236104497098341",
          toSpanId: () => "3369753143434738315",
          _sampling: {
            priority: "1",
          },
        };

        const event: SQSEvent = {
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

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
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

      // Kinesis stream event
      it("extracts trace context from Kinesis event", async () => {
        mockSpanContext = {
          toTraceId: () => "667309514221035538",
          toSpanId: () => "1350735035497811828",
          _sampling: {
            priority: "1",
          },
        };

        const event: KinesisStreamEvent = {
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

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
        expect(traceContext).not.toBeNull();

        expect(spyTracerWrapper).toHaveBeenLastCalledWith({
          "x-datadog-parent-id": "1350735035497811828",
          "x-datadog-sampled": "1",
          "x-datadog-sampling-priority": "1",
          "x-datadog-trace-id": "667309514221035538",
        });

        expect(traceContext?.toTraceId()).toBe("667309514221035538");
        expect(traceContext?.toSpanId()).toBe("1350735035497811828");
        expect(traceContext?.sampleMode()).toBe("1");
        expect(traceContext?.source).toBe("event");
      });

      // EventBridge message event
      it("extracts trace context from EventBridge event", async () => {
        mockSpanContext = {
          toTraceId: () => "5827606813695714842",
          toSpanId: () => "4726693487091824375",
          _sampling: {
            priority: "1",
          },
        };

        const event: EventBridgeEvent<any, any> = {
          version: "0",
          id: "bd3c8258-8d30-007c-2562-64715b2d0ea8",
          "detail-type": "UserSignUp",
          source: "my.event",
          account: "601427279990",
          time: "2022-01-24T16:00:10Z",
          region: "eu-west-1",
          resources: [],
          detail: {
            hello: "there",
            _datadog: {
              "x-datadog-trace-id": "5827606813695714842",
              "x-datadog-parent-id": "4726693487091824375",
              "x-datadog-sampling-priority": "1",
            },
          },
        };

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
        expect(traceContext).not.toBeNull();

        expect(spyTracerWrapper).toHaveBeenCalledWith({
          "x-datadog-trace-id": "5827606813695714842",
          "x-datadog-parent-id": "4726693487091824375",
          "x-datadog-sampling-priority": "1",
        });

        expect(traceContext?.toTraceId()).toBe("5827606813695714842");
        expect(traceContext?.toSpanId()).toBe("4726693487091824375");
        expect(traceContext?.sampleMode()).toBe("1");
        expect(traceContext?.source).toBe("event");
      });

      // StepFunction context event
      it("extracts trace context from StepFunction event", async () => {
        const event = {
          Execution: {
            Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
            Input: {
              MyInput: "MyValue",
            },
            Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
            RoleArn:
              "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
            StartTime: "2022-12-08T21:08:17.924Z",
          },
          State: {
            Name: "step-one",
            EnteredTime: "2022-12-08T21:08:19.224Z",
            RetryCount: 2,
          },
          StateMachine: {
            Id: "arn:aws:states:sa-east-1:425362996713:stateMachine:logs-to-traces-sequential",
            Name: "my-state-machine",
          },
        };

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(event, {} as Context);
        expect(traceContext).not.toBeNull();

        expect(traceContext?.toTraceId()).toBe("1139193989631387307");
        expect(traceContext?.toSpanId()).toBe("5892738536804826142");
        expect(traceContext?.sampleMode()).toBe("1");
        expect(traceContext?.source).toBe("event");
      });
    });

    describe("lambda context", () => {
      it("extracts trace context from Lambda context", async () => {
        mockSpanContext = {
          toTraceId: () => "667309514221035538",
          toSpanId: () => "1350735035497811828",
          _sampling: {
            priority: "1",
          },
        };

        const context = {
          clientContext: {
            custom: {
              "x-datadog-trace-id": "667309514221035538",
              "x-datadog-parent-id": "1350735035497811828",
              "x-datadog-sampling-priority": "1",
            },
          },
        };

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract(undefined, context as any);
        expect(traceContext).not.toBeNull();

        expect(spyTracerWrapper).toHaveBeenCalledWith({
          "x-datadog-parent-id": "1350735035497811828",
          "x-datadog-sampling-priority": "1",
          "x-datadog-trace-id": "667309514221035538",
        });

        expect(traceContext?.toTraceId()).toBe("667309514221035538");
        expect(traceContext?.toSpanId()).toBe("1350735035497811828");
        expect(traceContext?.sampleMode()).toBe("1");
        expect(traceContext?.source).toBe("event");
      });
    });

    describe("xray", () => {
      // Fallback, event and context don't contain any trace context
      it("extracts trace context from Xray", async () => {
        process.env["_X_AMZN_TRACE_ID"] = "Root=1-5ce31dc2-2c779014b90ce44db5e03875;Parent=0b11cc4230d3e09e;Sampled=1";

        const tracerWrapper = new TracerWrapper();
        const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

        const traceContext = await extractor.extract({}, {} as Context);
        expect(traceContext).not.toBeNull();

        expect(traceContext?.toTraceId()).toBe("4110911582297405557");
        expect(traceContext?.toSpanId()).toBe("797643193680388254");
        expect(traceContext?.sampleMode()).toBe("2");
        expect(traceContext?.source).toBe("xray");
      });
    });
  });

  describe("getTraceEventExtractor", () => {
    beforeEach(() => {
      StepFunctionContextService["_instance"] = undefined as any;
    });
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["a string", "some-value"],
      ["a number", 1234],
      ["an object which doesn't match any expected event", { custom: "event" }],
    ])("returns undefined when event is '%s'", (_, event) => {
      const tracerWrapper = new TracerWrapper();
      const traceContextExtractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

      const extractor = traceContextExtractor["getTraceEventExtractor"](event);

      expect(extractor).toBeUndefined();
    });

    // Returns the expected event extractor when payload is from that event
    it.each([
      [
        "HTTPEventTraceExtractor",
        "headers",
        HTTPEventTraceExtractor,
        {
          headers: {},
        },
      ],
      [
        "SNSEventTraceExtractor",
        "SNS event",
        SNSEventTraceExtractor,
        {
          Records: [
            {
              Sns: {},
            },
          ],
        },
      ],
      [
        "SNSSQSventTraceExtractor",
        "SNS to SQS event",
        SNSSQSEventTraceExtractor,
        {
          Records: [
            {
              eventSource: "aws:sqs",
              body: '{"Type":"Notification", "TopicArn":"some-topic"}',
            },
          ],
        },
      ],
      [
        "EventBridgeSQSTraceExtractor",
        "EventBridge to SQS event",
        EventBridgeSQSEventTraceExtractor,
        {
          Records: [
            {
              eventSource: "aws:sqs",
              body: '{"detail-type":"some-detail-type"}',
            },
          ],
        },
      ],
      [
        "AppSyncEventTraceExtractor",
        "AppSync event",
        AppSyncEventTraceExtractor,
        {
          info: {
            selectionSetGraphQL: "some-selection",
          },
          request: {
            headers: {},
          },
        },
      ],
      [
        "SQSEventTraceExtractor",
        "SQS event",
        SQSEventTraceExtractor,
        {
          Records: [
            {
              eventSource: "aws:sqs",
            },
          ],
        },
      ],
      [
        "KinesisEventTraceExtractor",
        "Kinesis stream event",
        KinesisEventTraceExtractor,
        {
          Records: [
            {
              kinesis: {},
            },
          ],
        },
      ],
      [
        "EventBridgeEventTraceExtractor",
        "EventBridge event",
        EventBridgeEventTraceExtractor,
        {
          "detail-type": "some-detail-type",
        },
      ],
    ])("returns %s when event contains %s", (_, __, _class, event) => {
      const tracerWrapper = new TracerWrapper();
      const traceContextExtractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

      const extractor = traceContextExtractor["getTraceEventExtractor"](event);

      expect(extractor).toBeInstanceOf(_class);
    });

    it("returns StepFunctionEventTraceExtractor when event contains StepFunctionContext", () => {
      const event = {
        Execution: {
          Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
          Input: {
            MyInput: "MyValue",
          },
          Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
          RoleArn: "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
          StartTime: "2022-12-08T21:08:17.924Z",
        },
        State: {
          Name: "step-one",
          EnteredTime: "2022-12-08T21:08:19.224Z",
          RetryCount: 2,
        },
        StateMachine: {
          Id: "arn:aws:states:sa-east-1:425362996713:stateMachine:logs-to-traces-sequential",
          Name: "my-state-machine",
        },
      };

      const tracerWrapper = new TracerWrapper();
      const traceContextExtractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

      // Mimick TraceContextService.extract initialization
      const instance = StepFunctionContextService.instance(event);
      traceContextExtractor["stepFunctionContextService"] = instance;

      const extractor = traceContextExtractor["getTraceEventExtractor"](event);

      expect(extractor).toBeInstanceOf(StepFunctionEventTraceExtractor);
    });

    it("returns StepFunctionEventTraceExtractor when event contains legacy lambda StepFunctionContext", () => {
      const event = {
        Payload: {
          Execution: {
            Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
            Input: {
              MyInput: "MyValue",
            },
            Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
            RoleArn: "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
            StartTime: "2022-12-08T21:08:17.924Z",
          },
          State: {
            Name: "step-one",
            EnteredTime: "2022-12-08T21:08:19.224Z",
            RetryCount: 2,
          },
          StateMachine: {
            Id: "arn:aws:states:sa-east-1:425362996713:stateMachine:logs-to-traces-sequential",
            Name: "my-state-machine",
          },
        }
      };

      const tracerWrapper = new TracerWrapper();
      const traceContextExtractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

      // Mimick TraceContextService.extract initialization
      const instance = StepFunctionContextService.instance(event);
      traceContextExtractor["stepFunctionContextService"] = instance;

      const extractor = traceContextExtractor["getTraceEventExtractor"](event);

      expect(extractor).toBeInstanceOf(StepFunctionEventTraceExtractor);
    });
  });

  describe("addTraceContexToXray", () => {
    beforeEach(() => {
      StepFunctionContextService["_instance"] = undefined as any;
      sentSegment = undefined;
      closedSocket = false;
      process.env["_X_AMZN_TRACE_ID"] = undefined;
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = undefined;
    });

    it("adds StepFunction context when present over metadata", () => {
      jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);

      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = "localhost:127.0.0.1:2000";

      const stepFunctionEvent = {
        Execution: {
          Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
          Input: {
            MyInput: "MyValue",
          },
          Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
          RoleArn: "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
          StartTime: "2022-12-08T21:08:17.924Z",
        },
        State: {
          Name: "step-one",
          EnteredTime: "2022-12-08T21:08:19.224Z",
          RetryCount: 2,
        },
        StateMachine: {
          Id: "arn:aws:states:sa-east-1:425362996713:stateMachine:logs-to-traces-sequential",
          Name: "my-state-machine",
        },
      };
      const instance = StepFunctionContextService.instance(stepFunctionEvent);

      const tracerWrapper = new TracerWrapper();
      const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

      extractor["stepFunctionContextService"] = instance;

      const spanContext = new SpanContextWrapper(
        {
          toTraceId: () => "4110911582297405551",
          toSpanId: () => "797643193680388251",
          _sampling: {
            priority: "2",
          },
        },
        TraceSource.Xray,
      );

      extractor["addTraceContextToXray"](spanContext);

      expect(sentSegment).toBeInstanceOf(Buffer);
      expect(closedSocket).toBeTruthy();

      const sentMessage = sentSegment.toString();
      expect(sentMessage).toEqual(
        '{"format": "json", "version": 1}\n{"id":"11111","trace_id":"1-5e272390-8c398be037738dc042009320","parent_id":"94ae789b969f1cc5","name":"datadog-metadata","start_time":1487076708,"end_time":1487076708,"type":"subsegment","metadata":{"datadog":{"root_span_metadata":{"step_function.execution_name":"85a9933e-9e11-83dc-6a61-b92367b6c3be","step_function.execution_id":"arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf","step_function.execution_input":{"MyInput":"MyValue"},"step_function.execution_role_arn":"arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03","step_function.execution_start_time":"2022-12-08T21:08:17.924Z","step_function.state_entered_time":"2022-12-08T21:08:19.224Z","step_function.state_machine_arn":"arn:aws:states:sa-east-1:425362996713:stateMachine:logs-to-traces-sequential","step_function.state_machine_name":"my-state-machine","step_function.state_name":"step-one","step_function.state_retry_count":2}}}}',
      );
    });

    it("adds spanContext to Xray", () => {
      jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);

      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = "localhost:127.0.0.1:2000";

      const tracerWrapper = new TracerWrapper();
      const extractor = new TraceContextExtractor(tracerWrapper, {} as TraceConfig);

      const spanContext = new SpanContextWrapper(
        {
          toTraceId: () => "4110911582297405551",
          toSpanId: () => "797643193680388251",
          _sampling: {
            priority: "2",
          },
        },
        TraceSource.Xray,
      );

      extractor["addTraceContextToXray"](spanContext);

      expect(sentSegment).toBeInstanceOf(Buffer);
      expect(closedSocket).toBeTruthy();

      const sentMessage = sentSegment.toString();
      expect(sentMessage).toEqual(
        '{"format": "json", "version": 1}\n{"id":"11111","trace_id":"1-5e272390-8c398be037738dc042009320","parent_id":"94ae789b969f1cc5","name":"datadog-metadata","start_time":1487076708,"end_time":1487076708,"type":"subsegment","metadata":{"datadog":{"trace":{"trace-id":"4110911582297405551","parent-id":"797643193680388251","sampling-priority":"2"}}}}',
      );
    });
  });
});
