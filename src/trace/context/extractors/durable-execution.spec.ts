import { DurableExecutionEventTraceExtractor } from "./durable-execution";
import { TracerWrapper } from "../../tracer-wrapper";

function makeTracerWrapper(datadogOnlyReturn: any = null): TracerWrapper {
  return {
    extractDatadogOnly: jest.fn().mockReturnValue(datadogOnlyReturn),
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
    const tracerWrapper = makeTracerWrapper(sentinelContext);
    const extractor = new DurableExecutionEventTraceExtractor(tracerWrapper);
    const context = extractor.extract(event);

    // Checkpoints are written by dd-trace-js in Datadog style only — extract
    // must use the matching forced-datadog propagator, not the user-configured one.
    expect(tracerWrapper.extractDatadogOnly).toHaveBeenCalledWith(checkpointHeaders);
    expect(context).toBe(sentinelContext);
  });

  it("returns null when no checkpoint exists", () => {
    const tracerWrapper = makeTracerWrapper();
    const extractor = new DurableExecutionEventTraceExtractor(tracerWrapper);

    const context = extractor.extract({
      DurableExecutionArn: "arn:aws:lambda:us-east-2:123:function:demo",
      CheckpointToken: "t-empty",
      InitialExecutionState: { Operations: [] },
    });

    expect(context).toBeNull();
    expect(tracerWrapper.extractDatadogOnly).not.toHaveBeenCalled();
  });
});
