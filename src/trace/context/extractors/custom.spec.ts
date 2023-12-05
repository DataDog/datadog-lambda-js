import { Context } from "aws-lambda";
import { CustomTraceExtractor } from "./custom";
import { DATADOG_PARENT_ID_HEADER, DATADOG_SAMPLING_PRIORITY_HEADER, DATADOG_TRACE_ID_HEADER } from "../extractor";
import { TraceContext, TraceSource } from "../../trace-context-service";

describe("CustomTraceExtractor", () => {
  describe("extract", () => {
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
        "async legacy",
        {
          traceExtractor: async (event: any, _context: Context): Promise<TraceContext> => {
            // note the change of variable names (uppercase D)
            const traceID = event.foo[DATADOG_TRACE_ID_HEADER];
            const parentID = event.foo[DATADOG_PARENT_ID_HEADER];
            const samplingPriority = event.foo[DATADOG_SAMPLING_PRIORITY_HEADER];
            const sampleMode = parseInt(samplingPriority, 10);

            return {
              parentID,
              sampleMode,
              source: TraceSource.Event,
              traceID,
            };
          },
        },
      ],
      [
        "sync",
        {
          traceExtractor: (event: any, _context: Context): TraceContext => {
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
        "sync legacy",
        {
          traceExtractor: (event: any, _context: Context): TraceContext => {
            // note the change of variable names (uppercase D)
            const traceID = event.foo[DATADOG_TRACE_ID_HEADER];
            const parentID = event.foo[DATADOG_PARENT_ID_HEADER];
            const samplingPriority = event.foo[DATADOG_SAMPLING_PRIORITY_HEADER];
            const sampleMode = parseInt(samplingPriority, 10);

            return {
              parentID,
              sampleMode,
              source: TraceSource.Event,
              traceID,
            };
          },
        },
      ],
    ])("extracts trace context with valid payload - %s", async (_, tracerConfig) => {
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

      const extractor = new CustomTraceExtractor(tracerConfig.traceExtractor);

      const traceContext = await extractor.extract(event, {} as Context);
      expect(traceContext).not.toBeNull();

      expect(spyCustomExtractor).toHaveBeenCalled();

      expect(traceContext?.toTraceId()).toBe("4110911582297405551");
      expect(traceContext?.toSpanId()).toBe("797643193680388251");
      expect(traceContext?.sampleMode()).toBe("2");
      expect(traceContext?.source).toBe("event");
    });

    it("returns null when extractor throws an error", async () => {
      const tracerConfig = {
        traceExtractor: async (event: any, _context: Context) => {
          throw Error("Not found");
        },
      };
      const spyCustomExtractor = jest.spyOn(tracerConfig, "traceExtractor");

      const extractor = new CustomTraceExtractor(tracerConfig.traceExtractor);

      const traceContext = await extractor.extract({}, {} as Context);
      expect(traceContext).toBeNull();
      expect(spyCustomExtractor).toHaveBeenCalled();
    });
  });
});
