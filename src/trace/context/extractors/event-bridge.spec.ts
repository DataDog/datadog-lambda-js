import { TracerWrapper } from "../../tracer-wrapper";
import { EventBridgeEventTraceExtractor } from "./event-bridge";

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

describe("EventBridgeEventTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
    });

    afterEach(() => {
      jest.resetModules();
    });

    it("extracts trace context with valid payload", () => {
      mockSpanContext = {
        toTraceId: () => "5827606813695714842",
        toSpanId: () => "4726693487091824375",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
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

      const extractor = new EventBridgeEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
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

    it.each([
      ["detail", {}],
      ["_datadog in detail", { hello: "there" }],
    ])("returns null and skips extracting when payload is missing '%s'", (_, payload) => {
      const tracerWrapper = new TracerWrapper();
      const extractor = new EventBridgeEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload as any);
      expect(traceContext).toBeNull();
    });

    it("returns null when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper();

      const payload = {
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
          _datadog: {},
        },
      };

      const extractor = new EventBridgeEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).toBeNull();
    });
  });
});
