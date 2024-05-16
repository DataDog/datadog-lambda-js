import {
  DATADOG_SAMPLING_PRIORITY_HEADER,
  DATADOG_TRACE_ID_HEADER,
  DATADOG_PARENT_ID_HEADER,
} from "./context/extractor";
import { SampleMode } from "./trace-context-service";
import { XrayService } from "./xray-service";

let sentSegment: any;
let closedSocket = false;

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

describe("XrayService", () => {
  describe("extract", () => {
    beforeEach(() => {
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = undefined;
      process.env["_X_AMZN_TRACE_ID"] = undefined;
    });

    it("extracts the trace context from Xray context", () => {
      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
      const xray = new XrayService();

      const traceContext = xray.extract();
      expect(traceContext).not.toBeNull();

      expect(traceContext?.toTraceId()).toBe("3995693151288333088");
      expect(traceContext?.toSpanId()).toBe("10713633173203262661");
      expect(traceContext?.sampleMode()).toBe("2");
      expect(traceContext?.source).toBe("xray");
    });

    it("returns null when no context is set", () => {
      const xray = new XrayService();

      const traceContext = xray.extract();
      expect(traceContext).toBeNull();
    });

    it("returns null when Xray trace context is undefined", () => {
      const xray = new XrayService();

      xray["parseTraceContextHeader"] = () => ({
        parentId: "1234567890123456",
        traceId: "not-traceid", // not valid format
        sampled: "1",
      });

      const traceContext = xray.extract();
      expect(traceContext).toBeNull();
    });
  });

  describe("traceContext", () => {
    beforeEach(() => {
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = undefined;
      process.env["_X_AMZN_TRACE_ID"] = undefined;
    });

    it("returns trace context from Xray context", () => {
      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
      const xray = new XrayService();

      const traceContext = xray["traceContext"];

      expect(traceContext).toEqual({
        parentId: "10713633173203262661",
        sampleMode: 2,
        source: "xray",
        traceId: "3995693151288333088",
      });
    });

    it("returns undefined when context converted parentId is undefined", () => {
      const xray = new XrayService();

      xray["parseTraceContextHeader"] = () => ({
        parentId: "1234567890123456",
        traceId: "not-traceid", // not valid format
        sampled: "1",
      });

      const traceContext = xray["traceContext"];

      expect(traceContext).toBeUndefined();
    });

    it("returns undefined when context converted traceId is undefined", () => {
      const xray = new XrayService();

      xray["parseTraceContextHeader"] = () => ({
        parentId: "123456789012345", // not 16 characters length
        traceId: "not-long-enough",
        sampled: "1",
      });

      const traceContext = xray["traceContext"];

      expect(traceContext).toBeUndefined();
    });

    it("returns undefined when no context is set", () => {
      const xray = new XrayService();
      const traceContext = xray["traceContext"];

      expect(traceContext).toBeUndefined();
    });
  });
  describe("add", () => {
    beforeEach(() => {
      sentSegment = undefined;
      closedSocket = false;
      process.env["_X_AMZN_TRACE_ID"] = undefined;
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = undefined;
    });

    it("adds the subsegment to be sent to the Xray daemon", () => {
      jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);

      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = "localhost:127.0.0.1:2000";

      const xray = new XrayService();
      xray["add"]("test-key", { test: "metadata" });

      expect(sentSegment).toBeInstanceOf(Buffer);
      expect(closedSocket).toBeTruthy();

      const sentMessage = sentSegment.toString();
      expect(sentMessage).toEqual(
        '{"format": "json", "version": 1}\n{"id":"11111","trace_id":"1-5e272390-8c398be037738dc042009320","parent_id":"94ae789b969f1cc5","name":"datadog-metadata","start_time":1487076708,"end_time":1487076708,"type":"subsegment","metadata":{"datadog":{"test-key":{"test":"metadata"}}}}',
      );
    });

    it("skips adding when generated subsegment is undefined", () => {
      const xray = new XrayService();
      xray["add"]("test-key", { test: "metadata" });

      expect(sentSegment).toBeUndefined();
      expect(closedSocket).toBeFalsy();
    });
  });

  describe("parseTraceContextHeader", () => {
    beforeEach(() => {
      process.env["_X_AMZN_TRACE_ID"] = undefined;
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = undefined;
    });
    it("parses Xray header correctly", () => {
      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";

      const xray = new XrayService();
      const context = xray["parseTraceContextHeader"]();

      expect(context).toEqual({
        parentId: "94ae789b969f1cc5",
        sampled: "1",
        traceId: "1-5e272390-8c398be037738dc042009320",
      });
    });

    it("skips parsing if header does not contain a sampled value", () => {
      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;";
      const xray = new XrayService();
      const context = xray["parseTraceContextHeader"]();

      expect(context).toBeUndefined();
    });

    it("skips parsing if header does not contain a parent", () => {
      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;";
      const xray = new XrayService();
      const context = xray["parseTraceContextHeader"]();

      expect(context).toBeUndefined();
    });

    it("skips parsing if no header is set", () => {
      const xray = new XrayService();
      const context = xray["parseTraceContextHeader"]();

      expect(context).toBeUndefined();
    });
  });

  describe("generateSubgsegment", () => {
    it("generates subgsegment as expected", () => {
      jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);

      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = "localhost:127.0.0.1:2000";

      const xray = new XrayService();
      const subsegment = xray["generateSubsegment"]("test-key", { test: "metadata" });

      expect(subsegment).toEqual(
        '{"id":"11111","trace_id":"1-5e272390-8c398be037738dc042009320","parent_id":"94ae789b969f1cc5","name":"datadog-metadata","start_time":1487076708,"end_time":1487076708,"type":"subsegment","metadata":{"datadog":{"test-key":{"test":"metadata"}}}}',
      );
    });

    it("skips generating if Xray context sampled is 0", () => {
      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=0";
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = "localhost:127.0.0.1:2000";

      const xray = new XrayService();
      const subsegment = xray["generateSubsegment"]("test-key", { test: "metadata" });

      expect(subsegment).toBeUndefined();
    });

    it("skips generating if Xray context is undefined", () => {
      const xray = new XrayService();
      const subsegment = xray["generateSubsegment"]("test-key", { test: "metadata" });

      expect(subsegment).toBeUndefined();
    });
  });

  describe("sendSubsegment", () => {
    beforeEach(() => {
      sentSegment = undefined;
      closedSocket = false;
      process.env["_X_AMZN_TRACE_ID"] = undefined;
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = undefined;
    });

    it("sends subsegment to Xray daemon", () => {
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = "localhost:127.0.0.1:2000";
      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";

      const xray = new XrayService();
      xray["sendSubsegment"]("test-subsegment");

      expect(sentSegment).toBeInstanceOf(Buffer);
      expect(closedSocket).toBeTruthy();

      const sentMessage = sentSegment.toString();
      expect(sentMessage).toEqual('{"format": "json", "version": 1}\ntest-subsegment');
    });

    it("skips sending subsegment when Xray daemon is not present", () => {
      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";

      const xray = new XrayService();
      xray["sendSubsegment"]("test-subsegment");

      expect(sentSegment).toBeUndefined();
      expect(closedSocket).toBeFalsy();
    });

    it("skips sending subsegment when Xray daemon has invalid format", () => {
      process.env["AWS_XRAY_DAEMON_ADDRESS"] = "localhost";
      process.env["_X_AMZN_TRACE_ID"] = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";

      const xray = new XrayService();
      xray["sendSubsegment"]("test-subsegment");

      expect(sentSegment).toBeUndefined();
      expect(closedSocket).toBeFalsy();
    });
  });

  describe("convertToSampleMode", () => {
    it("returns USER_KEEP if xray was sampled", () => {
      const xray = new XrayService();
      const sampleMode = xray["convertToSampleMode"](1);
      expect(sampleMode).toBe(SampleMode.USER_KEEP);
    });
    it("returns USER_REJECT if xray wasn't sampled", () => {
      const xray = new XrayService();
      const sampleMode = xray["convertToSampleMode"](0);
      expect(sampleMode).toBe(SampleMode.USER_REJECT);
    });
  });

  describe("convertToParentId", () => {
    it("converts an Xray Parent Id to a Datadog Parent Id", () => {
      const xray = new XrayService();
      const xrayParentId = "0b11cc4230d3e09e";
      const parentId = xray["convertToParentId"](xrayParentId);
      expect(parentId).toEqual("797643193680388254");
    });
    it("returns undefined when parent ID uses invalid characters", () => {
      const xray = new XrayService();
      const xrayParentId = ";79014b90ce44db5e0;875";
      const parentId = xray["convertToParentId"](xrayParentId);
      expect(parentId).toBeUndefined();
    });
    it("returns undefined when parent ID is wrong size", () => {
      const xray = new XrayService();
      const xrayParentId = "5e03875";
      const parentId = xray["convertToParentId"](xrayParentId);
      expect(parentId).toBeUndefined();
    });
  });

  describe("convertToTraceId", () => {
    it("converts an Xray Trace Id to a Datadog Trace Id", () => {
      const xray = new XrayService();
      const xrayTraceId = "1-5ce31dc2-2c779014b90ce44db5e03875";
      const traceId = xray["convertToTraceId"](xrayTraceId);
      expect(traceId).toEqual("4110911582297405557");
    });

    it("converts an Xray Trace Id to a Datadog Trace Id removing first bit", () => {
      const xray = new XrayService();
      const xrayTraceId = "1-5ce31dc2-ac779014b90ce44db5e03875"; // Number with 64bit toggled on
      const traceId = xray["convertToTraceId"](xrayTraceId);
      expect(traceId).toEqual("4110911582297405557");
    });

    it.each([
      ["is too short", "1-5ce31dc2-5e03875"],
      ["is in an invalid format", "1-2c779014b90ce44db5e03875"],
      ["uses invalid characters", "1-5ce31dc2-c779014b90ce44db5e03875;"],
    ])("returns undefined when Xray Trace Id %s", (_, xrayTraceId) => {
      const xray = new XrayService();
      const traceId = xray["convertToTraceId"](xrayTraceId);
      expect(traceId).toBeUndefined();
    });
  });

  describe("parseAWSTraceHeader", () => {
    it("parses AWS trace header correctly", () => {
      const awsTraceHeader = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
      const xrayHeaders = XrayService.parseAWSTraceHeader(awsTraceHeader);
      expect(xrayHeaders).toEqual({
        parentId: "94ae789b969f1cc5",
        sampled: "1",
        traceId: "1-5e272390-8c398be037738dc042009320",
      });
    });
    it.each(["Root=1-5e272390-8c398be037738dc042009320", "Root=1-65f2f78c-0000000008addb5405b376c0;Parent;Sampled"])(
      "returns undefined when AWS trace header is malformatted",
      (awsTraceHeader) => {
        const xrayHeaders = XrayService.parseAWSTraceHeader(awsTraceHeader);
        expect(xrayHeaders).toBeUndefined();
      },
    );
  });
  describe("extraceDDContextFromAWSTraceHeader", () => {
    it("extracts Datadog trace context from AWS trace header", () => {
      const awsTraceId = "Root=1-65f2f78c-0000000008addb5405b376c0;Parent=5abcb7ed643995c7;Sampled=1";
      const ddTraceContext = XrayService.extraceDDContextFromAWSTraceHeader(awsTraceId);

      expect(ddTraceContext?.toTraceId()).toEqual("625397077193750208");
      expect(ddTraceContext?.toSpanId()).toEqual("6538302989251745223");
      expect(ddTraceContext?.sampleMode()).toEqual("1");
    });

    it("returns null when AWS trace header is NOT injected by dd-trace", () => {
      const awsTraceId = "Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1";
      const ddTraceContext = XrayService.extraceDDContextFromAWSTraceHeader(awsTraceId);
      expect(ddTraceContext).toBeNull();
    });
    it("returns null when AWS trace header cannot be parsed", () => {
      const awsTraceId = "Root=1-5e272390-8c398be037738dc042009320;;";
      const ddTraceContext = XrayService.extraceDDContextFromAWSTraceHeader(awsTraceId);
      expect(ddTraceContext).toBeNull();
    });
  });
});
