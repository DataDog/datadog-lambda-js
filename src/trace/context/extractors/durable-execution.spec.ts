import { createHash } from "crypto";
import { createDurableExecutionRootSpan, DurableExecutionEventTraceExtractor } from "./durable-execution";

jest.mock("dd-trace", () => ({
  startSpan: jest.fn(),
}));

function deterministicRootSpanId(executionArn: string): string {
  const hash = createHash("sha256").update(`durable-root:${executionArn}`).digest("hex");
  const masked = BigInt(`0x${hash}`) & 0x7fffffffffffffffn;
  return masked === 0n ? "1" : masked.toString(10);
}

describe("DurableExecutionEventTraceExtractor", () => {
  const tracer = require("dd-trace");
  const startSpanMock = tracer.startSpan as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("extracts a deterministic durable root span id from executionArn", () => {
    const executionArn =
      "arn:aws:lambda:us-east-2:123456789012:function:demo:$LATEST/durable-execution/demo/abc";

    const event = {
      DurableExecutionArn: executionArn,
      CheckpointToken: "t-1",
      InitialExecutionState: {
        Operations: [
          {
            Id: "op-1",
            Name: "_dd_trace_context_0",
            Status: "SUCCEEDED",
            StepDetails: {
              Result: JSON.stringify({
                "x-datadog-trace-id": "149750110124521191",
                "x-datadog-parent-id": "987654321012345678",
                "x-datadog-sampling-priority": "1",
              }),
            },
          },
        ],
      },
    };

    const extractor = new DurableExecutionEventTraceExtractor();
    const context = extractor.extract(event);

    expect(context).not.toBeNull();
    expect(context?.toTraceId()).toBe("149750110124521191");
    expect(context?.toSpanId()).toBe("987654321012345678");
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

    const extractor = new DurableExecutionEventTraceExtractor();
    const extracted = extractor.extract(firstInvocationEvent);

    const root = createDurableExecutionRootSpan(firstInvocationEvent, extracted);

    expect(root).not.toBeNull();
    expect(startSpanMock).toHaveBeenCalledTimes(1);
    expect(root?.span.context()._spanId.toString(10)).toBe("2222222222222222222");
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

    const extractor = new DurableExecutionEventTraceExtractor();
    const extracted = extractor.extract(replayEvent);
    const root = createDurableExecutionRootSpan(replayEvent, extracted);

    expect(root).toBeNull();
    expect(startSpanMock).not.toHaveBeenCalled();
  });
});

