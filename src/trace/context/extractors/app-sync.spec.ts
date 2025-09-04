import { TracerWrapper } from "../../tracer-wrapper";
import { AppSyncEventTraceExtractor } from "./app-sync";

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

describe("AppSyncEventTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
    });

    afterEach(() => {
      jest.resetModules();
    });

    it("extracts trace context with valid payload", () => {
      mockSpanContext = {
        toTraceId: () => "797643193680388254",
        toSpanId: () => "4110911582297405557",
        _sampling: {
          priority: "2",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
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

      const extractor = new AppSyncEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext.length).toBe(1);

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-parent-id": "797643193680388254",
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "4110911582297405557",
      });

      expect(traceContext?.[0].toTraceId()).toBe("797643193680388254");
      expect(traceContext?.[0].toSpanId()).toBe("4110911582297405557");
      expect(traceContext?.[0].sampleMode()).toBe("2");
      expect(traceContext?.[0].source).toBe("event");
    });

    it("returns an empty array when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper();

      const payload = {
        info: {
          selectionSetGraphQL: "{ items }",
        },
        request: {
          headers: {
            "some-key": "some-value",
          },
        },
      };

      const extractor = new AppSyncEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).toStrictEqual([]);
    });
  });
});
