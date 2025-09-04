import { TracerWrapper } from "../../tracer-wrapper";
import { LambdaContextTraceExtractor } from "./lambda-context";

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

describe("LambdaContextTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
    });

    afterEach(() => {
      jest.resetModules();
    });

    it.each([
      [
        "legacy payload",
        {
          _datadog: {
            "x-datadog-trace-id": "667309514221035538",
            "x-datadog-parent-id": "1350735035497811828",
            "x-datadog-sampling-priority": "1",
          },
        },
      ],
      [
        "payload",
        {
          "x-datadog-trace-id": "667309514221035538",
          "x-datadog-parent-id": "1350735035497811828",
          "x-datadog-sampling-priority": "1",
        },
      ],
    ])("extracts trace context with valid '%s'", (_, customValue) => {
      mockSpanContext = {
        toTraceId: () => "667309514221035538",
        toSpanId: () => "1350735035497811828",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
        clientContext: {
          custom: customValue,
        },
      };

      const extractor = new LambdaContextTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext.length).toBe(1);

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-parent-id": "1350735035497811828",
        "x-datadog-sampling-priority": "1",
        "x-datadog-trace-id": "667309514221035538",
      });

      expect(traceContext?.[0].toTraceId()).toBe("667309514221035538");
      expect(traceContext?.[0].toSpanId()).toBe("1350735035497811828");
      expect(traceContext?.[0].sampleMode()).toBe("1");
      expect(traceContext?.[0].source).toBe("event");
    });

    it.each([
      ["context", undefined],
      ["clientContext", {}],
      ["custom key in clientContext", { clientContext: {} }],
      ["object value in custom key", { clientContext: { custom: "not-an-object" } }],
    ])("returns null and skips extracting when payload is missing '%s'", (_, payload) => {
      const tracerWrapper = new TracerWrapper();
      const extractor = new LambdaContextTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload as any);
      expect(traceContext).toStrictEqual([]);
    });

    it("returns an empty array when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper();

      const payload = {
        clientContext: {
          custom: {
            foo: "bar",
          },
        },
      };

      const extractor = new LambdaContextTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).toStrictEqual([]);
    });
  });
});
