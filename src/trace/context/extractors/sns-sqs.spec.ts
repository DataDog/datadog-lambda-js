import { TracerWrapper } from "../../tracer-wrapper";
import { SNSSQSEventTraceExtractor } from "./sns-sqs";
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

describe("SNSSQSEventTraceExtractor", () => {
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
            body: '{\n  "Type" : "Notification",\n  "MessageId" : "0a0ab23e-4861-5447-82b7-e8094ff3e332",\n  "TopicArn" : "arn:aws:sns:eu-west-1:601427279990:js-library-test-dev-demoTopic-15WGUVRCBMPAA",\n  "Message" : "{\\"hello\\":\\"harv\\",\\"nice of you to join us\\":\\"david\\",\\"anotherThing\\":{\\"foo\\":\\"bar\\",\\"blah\\":null,\\"harv\\":123},\\"vals\\":[{\\"thingOne\\":1},{\\"thingTwo\\":2}],\\"ajTimestamp\\":1639777617957}",\n  "Timestamp" : "2021-12-17T21:46:58.040Z",\n  "SignatureVersion" : "1",\n  "Signature" : "FR35/7E8C3LHEVk/rC4XxXlXwV/5mNkFNPgDhHSnJ2I6hIoSrTROAm7h5xm1PuBkAeFDvq0zofw91ouk9zZyvhdrMLFIIgrjEyNayRmEffmoEAkzLFUsgtQX7MmTl644r4NuWiM0Oiz7jueRvIcKXcZr7Nc6GJcWV1ymec8oOmuHNMisnPMxI07LIQVYSyAfv6P9r2jEWMVIukRoCzwTnRk4bUUYhPSGHI7OC3AsxxXBbv8snqTrLM/4z2rXCf6jHCKNxWeLlm9/45PphCkEyx5BWS4/71KaoMWUWy8+6CCsy+uF3XTCVmvSEYLyEwTSzOY+vCUjazrRW93498i70g==",\n  "SigningCertUrl" : "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-************************33ab7e69.pem",\n  "UnsubscribeUrl" : "https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:eu-west-1:601427279990:js-library-test-dev-demoTopic-15WGUVRCBMPAA:1290f550-9a8a-4e8f-a900-8f5f96dcddda",\n  "MessageAttributes" : {\n    "_datadog" : {"Type":"String","Value":"{\\"x-datadog-trace-id\\":\\"2776434475358637757\\",\\"x-datadog-parent-id\\":\\"4493917105238181843\\",\\"x-datadog-sampled\\":\\"1\\",\\"x-datadog-sampling-priority\\":\\"1\\"}"}\n  }\n}',
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
    it("extracts trace context from AWSTraceHeader with valid payload", () => {
      const tracerWrapper = new TracerWrapper();
      const payload = {
        Records: [
          {
            messageId: "40304cba-041c-4284-808e-8d8692c6cba1",
            receiptHandle:
              "AQEBisC4xIjrp5W72r64fIf86ilRqadl6sbkmqbx41BI7P5ov0dJSNaNG97dnmOqSMD+MhXTvvC7HL2i+3viGrC8iNacZXSr9zzZvpFLFYO6jphDRTNJdkEZqSbKUoN5c/Nri5FjA4X52q4pCvW1esADJ2ZcMQQuQ19gsKAEQ0VGkHpH+BeceQtoFc3XT7uJboykfUA6iWT4TyNdJS+O4119ZBdN3U1jZ3PUn8mmTSi+SkTiXPBD9ywu6X8VzkGahueT+P7tJQTZ27mbPKhfrt3kvbFD6z7lqBNQyAPoqHzAThGC3VbZOxth3iqf7kjsFccmSJsxvsBzcVpF6nmobf6dpxwnZTEIrlNpQGrBgoePIHrpWfC6UG6aRTc4zWc30VY6hcg09WjCNGI81KwDfNMDAdJknOhsbY3HtvRQkQncbXgsYXgDDJG3PdIUoI2YScLeWEBMwE/HPCWk0X3K6McczRIHw3PfLaS2eVpjzNlq9I4=",
            body: '{\n  "Type" : "Notification",\n  "MessageId" : "d968a20b-73c3-5389-ae7a-fcb844faf1c7",\n  "TopicArn" : "arn:aws:sns:us-west-2:425362996713:DdTraceXLambda-snssqschecksNestedStacksnssqschecksNestedStackResource58F786C6-11NORKTA1JFML-snsProducerJavaForPythonNonRawsnssqsproducerjavaforpythonnonrawtopicDDBAB6EA-ZBb8uCZzkS0S",\n  "Message" : "hello from DdTraceXLambda-snssqschec-snssqsproducerjavaforpyt-z0t7yDk3zWt1",\n  "Timestamp" : "2024-05-06T19:52:25.181Z",\n  "SignatureVersion" : "1",\n  "Signature" : "pZIIa0Ae49vUPVSZcR4XCt9K2gMWYBjIJCZbQJo6URKLJOcC4yJNXVzOQAb80tG10lgOq+gMahLaTcuJ5+yFr3LtK/8nl7mdeP7aH6V2VoRubmJuc7P2WUixhubve577MfFMjp1LrkQaa5D/ken6yOjjgxRy32GazYAUEeQ9duldSAuu3omfsljWnZSHoeHkpbVkCrp/KyNGDQKrf+pFxxuxb9yqUzbHa8H80zS9fwOEsBuSqlbyK2Mj68wneqSeuRcZ30l5xyJ82vVjyXEukNcSkt5OcZOYFGqxotIY7MKTr2nrkiFOJAiRsOK34eQyk7eVdWRRfyoxCHVpnImT1Q==",\n  "SigningCertURL" : "https://sns.us-west-2.amazonaws.com/SimpleNotificationService-************************33ab7e69",\n  "UnsubscribeURL" : "https://sns.us-west-2.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-west-2:425362996713:DdTraceXLambda-snssqschecksNestedStacksnssqschecksNestedStackResource58F786C6-11NORKTA1JFML-snsProducerJavaForPythonNonRawsnssqsproducerjavaforpythonnonrawtopicDDBAB6EA-ZBb8uCZzkS0S:d44c53e8-538c-472f-89e1-89c131d9cd26",\n  "MessageAttributes" : {\n    "JOEYTEST" : {"Type":"String","Value":"test"},\n    "JOEYTEST2" : {"Type":"String","Value":"test2"}\n  }\n}',
            attributes: {
              ApproximateReceiveCount: "1",
              AWSTraceHeader: "Root=1-663934f8-0000000045c5da17458c9910;Parent=18f37c8f541d052f;Sampled=1",
              SentTimestamp: "1715025145210",
              SenderId: "AIDAIYLAVTDLUXBIEIX46",
              ApproximateFirstReceiveTimestamp: "1715025145220",
            },
            messageAttributes: {},
            md5OfBody: "************************33ab7e69",
            eventSource: "aws:sqs",
            eventSourceARN:
              "arn:aws:sqs:us-west-2:425362996713:DdTraceXLambda-snssqschecksNested-snsProducerJavaForPythonNonRawsns-1vws7QPqW8e6",
            awsRegion: "us-west-2",
          },
        ],
      };

      const extractor = new SNSSQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      // Should not use ddtracer extractor. Because 1. it's an unnecessary extra step and
      // 2. More importantly, DD_TRACE_PROPAGATION_STYLE could cause extraction fail
      expect(spyTracerWrapper).not.toHaveBeenCalled();

      expect(traceContext?.toTraceId()).toBe("5027664352514971920");
      expect(traceContext?.toSpanId()).toBe("1797917631284315439");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it("extracts trace context from Step Function SNS-SQS event", () => {
      // Reset StepFunctionContextService instance
      StepFunctionContextService["_instance"] = undefined as any;

      const tracerWrapper = new TracerWrapper();

      const payload = {
        Records: [
          {
            messageId: "43a5f138-f166-40f1-b7e4-a7e0af9d633d",
            receiptHandle:
              "AQEBrhzl4RiITHp/ui07Y0DlDIdrmYHveKjqDIsx2gG7Z3fvrDohnfnpy/r4esh/ZsilJUR/C3uohYe6HUqvixymhx+io9S/MYNoA1zjmSVd1V4ZKe6saMs6L7aSW5TgrLpuxOtNGWvmNijdlQlOoYW1xRlkzkBywFkELfazExJHrThbxpxXcHbcAoh1Vz77EvlcAQNbc11vTccoUcMcdczvoLd/wgyrsIf0z8qdUQHaspWYoWOlZOsoflDMddYwqWO3LNRphAGMp5ISTDVbVqo1/U+wOqBj+b3dOYP9k0vS9Mj+36t+EJ8+KETFXRPNk4mZ+7hvG+UCYBN582gT502MnQitxylHKWOlH77nIokfk43FjhjsybLE48KdWdO49O2WKslXwCpPLQWnbKWlUl05/12tIk41MolVyfiWywW9R/S7hgcSr51tEBcjZTW8GR8r",
            body: '{"testData":"Hello from SQS integration test","timestamp":"2025-07-15T18:16:27Z"}',
            attributes: {
              ApproximateReceiveCount: "1",
              SentTimestamp: "1752603390964",
              SenderId: "AIDAIOA2GYWSHW4E2VXIO",
              ApproximateFirstReceiveTimestamp: "1752603390980",
            },
            messageAttributes: {
              _datadog: {
                stringValue:
                  '{"Execution":{"Id":"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-sns-sqs-demo-dev-state-machine:c363b975-c342-4e40-815a-8dd2496f5e81","StartTime":"2025-07-15T18:16:30.746Z","Name":"c363b975-c342-4e40-815a-8dd2496f5e81","RoleArn":"arn:aws:iam::123456123456:role/rstrat-sfn-sns-sqs-demo-d-StepFunctionsExecutionRol-T2O3igeuSihu","RedriveCount":0},"StateMachine":{"Id":"arn:aws:states:sa-east-1:123456123456:stateMachine:rstrat-sfn-sns-sqs-demo-dev-state-machine","Name":"rstrat-sfn-sns-sqs-demo-dev-state-machine"},"State":{"Name":"PublishToSNS","EnteredTime":"2025-07-15T18:16:30.776Z","RetryCount":0},"RootExecutionId":"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-sns-sqs-demo-dev-state-machine:c363b975-c342-4e40-815a-8dd2496f5e81","serverless-version":"v1"}',
                stringListValues: [],
                binaryListValues: [],
                dataType: "String",
              },
            },
            md5OfBody: "1e832c0d0aa5188dc5e3f2e85c9cb5e7",
            md5OfMessageAttributes: "64e36d01aec95ca5a2160c13299e9c3b",
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:sa-east-1:123456123456:rstrat-sfn-sns-sqs-demo-dev-process-event-queue",
            awsRegion: "sa-east-1",
          },
        ],
      };

      const extractor = new SNSSQSEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      // The StepFunctionContextService generates deterministic trace IDs
      expect(traceContext?.toTraceId()).toBe("1657966791618574655");
      expect(traceContext?.toSpanId()).toBe("5100002956473485303");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });
  });
});
