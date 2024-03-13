import { TracerWrapper } from "../../tracer-wrapper";
import { SNSSQSEventTraceExtractor } from "./sns-sqs";

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

describe("SNSSQSEventTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
    });

    afterEach(() => {
      jest.resetModules();
    });

    it("extracts trace context with valid payload with String Value", () => {
      mockSpanContext = {
        toTraceId: () => "2776434475358637757",
        toSpanId: () => "4493917105238181843",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
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

      const extractor = new SNSSQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
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

    it("extracts trace context with valid payload with Binary Value", () => {
      mockSpanContext = {
        toTraceId: () => "7102291628443134919",
        toSpanId: () => "4247550101648618618",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
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

      const extractor = new SNSSQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
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

    it.each([
      ["Records", {}],
      ["Records first entry", { Records: [] }],
      ["Records first entry body", { Records: [{}] }],
      ["valid data in body", { Records: [{ body: "{" }] }], // JSON.parse should fail
      ["MessageAttributes in body", { Records: [{ body: "{}" }] }],
      ["_datadog in MessageAttributes", { Records: [{ body: '{"MessageAttributes":{"text":"Hello, world!"}}' }] }],
      ["Value in _datadog", { Records: [{ body: '{"MessageAttributes":{"_datadog":{}}}' }] }],
    ])("returns null and skips extracting when payload is missing '%s'", (_, payload) => {
      const tracerWrapper = new TracerWrapper();
      const extractor = new SNSSQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload as any);
      expect(traceContext).toBeNull();
    });

    it("returns null when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper();

      const payload = {
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

      const extractor = new SNSSQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).toBeNull();
    });
  });
});
