import { DurableExecutionEventTraceExtractor } from "./durable-execution";
import { TracerWrapper } from "../../tracer-wrapper";

function makeTracerWrapper(opts: { datadogOnly?: any; standard?: any } = {}): TracerWrapper {
  return {
    extract: jest.fn().mockReturnValue(opts.standard ?? null),
    extractDatadogOnly: jest.fn().mockReturnValue(opts.datadogOnly ?? null),
  } as unknown as TracerWrapper;
}

describe("DurableExecutionEventTraceExtractor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("extracts checkpoint headers with the datadog-only propagator", () => {
    const executionArn = "arn:aws:lambda:us-east-2:123456789012:function:demo:$LATEST/durable-execution/demo/abc";

    const checkpointHeaders = {
      "x-datadog-trace-id": "149750110124521191",
      "x-datadog-parent-id": "987654321012345678",
      "x-datadog-sampling-priority": "1",
    };

    const event = {
      DurableExecutionArn: executionArn,
      CheckpointToken: "t-1",
      InitialExecutionState: {
        Operations: [
          {
            Id: "op-1",
            Name: "_datadog_0",
            Status: "SUCCEEDED",
            StepDetails: {
              Result: JSON.stringify(checkpointHeaders),
            },
          },
        ],
      },
    };

    const sentinelContext = { sentinel: true };
    const tracerWrapper = makeTracerWrapper({ datadogOnly: sentinelContext });
    const extractor = new DurableExecutionEventTraceExtractor(tracerWrapper);
    const context = extractor.extract(event);

    // Checkpoints are written by dd-trace-js in Datadog style only — extract
    // must use the matching forced-datadog propagator, not the user-configured one.
    expect(tracerWrapper.extractDatadogOnly).toHaveBeenCalledWith(checkpointHeaders);
    expect(tracerWrapper.extract).not.toHaveBeenCalled();
    expect(context).toBe(sentinelContext);
  });

  it("falls back to standard extract for upstream customer headers", () => {
    const executionArn = "arn:aws:lambda:us-east-2:123456789012:function:demo:$LATEST/durable-execution/demo/upstream";

    const upstreamHeaders = {
      "x-datadog-trace-id": "111",
      traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
    };

    const event = {
      DurableExecutionArn: executionArn,
      CheckpointToken: "t-upstream",
      InitialExecutionState: {
        Operations: [
          {
            Id: "op-1",
            Name: "input",
            Status: "RUNNING",
            ExecutionDetails: {
              InputPayload: JSON.stringify({ headers: upstreamHeaders }),
            },
          },
        ],
      },
    };

    const sentinelContext = { sentinel: "upstream" };
    const tracerWrapper = makeTracerWrapper({ standard: sentinelContext });
    const extractor = new DurableExecutionEventTraceExtractor(tracerWrapper);
    const context = extractor.extract(event);

    // Upstream headers come from arbitrary services; honor the user's
    // propagation-style configuration here.
    expect(tracerWrapper.extract).toHaveBeenCalledWith(upstreamHeaders);
    expect(tracerWrapper.extractDatadogOnly).not.toHaveBeenCalled();
    expect(context).toBe(sentinelContext);
  });

  it("returns null when no checkpoint or upstream context exists", () => {
    const tracerWrapper = makeTracerWrapper();
    const extractor = new DurableExecutionEventTraceExtractor(tracerWrapper);

    const context = extractor.extract({
      DurableExecutionArn: "arn:aws:lambda:us-east-2:123:function:demo",
      CheckpointToken: "t-empty",
      InitialExecutionState: { Operations: [] },
    });

    expect(context).toBeNull();
    expect(tracerWrapper.extract).not.toHaveBeenCalled();
    expect(tracerWrapper.extractDatadogOnly).not.toHaveBeenCalled();
  });
});
