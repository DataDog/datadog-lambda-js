import { createDurableExecutionRootSpan, DurableExecutionEventTraceExtractor } from "./durable-execution";
import { TracerWrapper } from "../../tracer-wrapper";

jest.mock("dd-trace", () => ({
  startSpan: jest.fn(),
}));

function makeTracerWrapper(extractReturn: any = null): TracerWrapper {
  return { extract: jest.fn().mockReturnValue(extractReturn) } as unknown as TracerWrapper;
}

describe("DurableExecutionEventTraceExtractor", () => {
  const tracer = require("dd-trace");
  const startSpanMock = tracer.startSpan as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("delegates checkpoint headers to the standard propagator", () => {
    const executionArn =
      "arn:aws:lambda:us-east-2:123456789012:function:demo:$LATEST/durable-execution/demo/abc";

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

    expect(tracerWrapper.extract).toHaveBeenCalledWith(checkpointHeaders);
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
  });

  it("creates durable root span only for first invocation", () => {
    const executionArn =
      "arn:aws:lambda:us-east-2:123456789012:function:demo:$LATEST/durable-execution/demo/first";

    const spanContext: any = {
      _spanId: null,
      _parentId: null,
      toTraceId: () => "1111111111111111111",
      toSpanId: () => "2222222222222222222",
    };
    const span = {
      context: () => spanContext,
      finish: jest.fn(),
    };
    startSpanMock.mockReturnValue(span);

    const firstInvocationEvent = {
      DurableExecutionArn: executionArn,
      CheckpointToken: "t-first",
      InitialExecutionState: {
        Operations: [
          {
            Id: "op-1",
            Name: "input",
            Status: "RUNNING",
            StartTimestamp: 1710000000000,
            ExecutionDetails: {
              InputPayload: JSON.stringify({ hello: "world" }),
            },
          },
        ],
      },
    };

    const root = createDurableExecutionRootSpan(firstInvocationEvent, null);

    expect(root).not.toBeNull();
    expect(startSpanMock).toHaveBeenCalledTimes(1);
  });

  it("skips durable root span creation on replay invocations", () => {
    const executionArn =
      "arn:aws:lambda:us-east-2:123456789012:function:demo:$LATEST/durable-execution/demo/replay";

    const replayEvent = {
      DurableExecutionArn: executionArn,
      CheckpointToken: "t-replay",
      InitialExecutionState: {
        Operations: [
          {
            Id: "op-1",
            Name: "_dd_trace_context_0",
            Status: "SUCCEEDED",
            StepDetails: {
              Result: JSON.stringify({
                "x-datadog-trace-id": "149750110124521191",
                "x-datadog-parent-id": "538591322263933970",
                "x-datadog-sampling-priority": "1",
              }),
            },
          },
          {
            Id: "op-2",
            Name: "callback_step_prepare",
            Status: "SUCCEEDED",
          },
        ],
      },
    };

    const tracerWrapper = makeTracerWrapper({ source: "Event" });
    const extractor = new DurableExecutionEventTraceExtractor(tracerWrapper);
    const extracted = extractor.extract(replayEvent);
    const root = createDurableExecutionRootSpan(replayEvent, extracted);

    expect(root).toBeNull();
    expect(startSpanMock).not.toHaveBeenCalled();
  });
});
