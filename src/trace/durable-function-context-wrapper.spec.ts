import { wrapDurableContext, DurableExecutionContext, OperationState } from "./durable-function-context-wrapper";

// Mock dd-trace
const mockFinish = jest.fn();
const mockSetTag = jest.fn();
const mockStartSpan = jest.fn().mockReturnValue({
  finish: mockFinish,
  setTag: mockSetTag,
});

jest.mock("dd-trace", () => ({
  startSpan: mockStartSpan,
}));

describe("wrapDurableContext", () => {
  let mockContext: DurableExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      step: jest.fn().mockResolvedValue("step-result"),
      wait: jest.fn().mockResolvedValue(undefined),
      invoke: jest.fn().mockResolvedValue("invoke-result"),
      waitForCallback: jest.fn().mockResolvedValue("callback-result"),
      parallel: jest.fn().mockResolvedValue(["result1", "result2"]),
      map: jest.fn().mockResolvedValue(["mapped1", "mapped2"]),
      runInChildContext: jest.fn().mockImplementation(async (name, fn) => {
        return fn(mockContext);
      }),
    };
  });

  describe("step", () => {
    it("creates span for new execution", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [] as OperationState[],
        },
      };

      const wrappedCtx = wrapDurableContext(mockContext, event);
      const result = await wrappedCtx.step("fetch-user", async () => "user-data");

      expect(mockStartSpan).toHaveBeenCalledWith("aws.lambda.durable.step", {
        tags: {
          "durable.operation.type": "step",
          "durable.operation.name": "fetch-user",
          "resource.name": "fetch-user",
        },
      });
      expect(mockFinish).toHaveBeenCalled();
      expect(mockContext.step).toHaveBeenCalledWith("fetch-user", expect.any(Function), undefined);
    });

    it("skips span for replay (Status=SUCCEEDED)", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [
            {
              Id: "step-fetch-user-1",
              Type: "STEP",
              Name: "fetch-user",
              Status: "SUCCEEDED" as const,
            },
          ],
        },
      };

      const wrappedCtx = wrapDurableContext(mockContext, event);
      await wrappedCtx.step("fetch-user", async () => "user-data");

      expect(mockStartSpan).not.toHaveBeenCalled();
      expect(mockContext.step).toHaveBeenCalled();
    });

    it("captures errors in span", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [] as OperationState[],
        },
      };

      (mockContext.step as jest.Mock).mockRejectedValue(new Error("Step failed"));

      const wrappedCtx = wrapDurableContext(mockContext, event);

      await expect(wrappedCtx.step("failing-step", async () => "data")).rejects.toThrow("Step failed");

      expect(mockSetTag).toHaveBeenCalledWith("error", true);
      expect(mockSetTag).toHaveBeenCalledWith("error.message", "Step failed");
      expect(mockSetTag).toHaveBeenCalledWith("error.type", "Error");
      expect(mockFinish).toHaveBeenCalled();
    });
  });

  describe("wait", () => {
    it("creates span for new wait", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [] as OperationState[],
        },
      };

      const wrappedCtx = wrapDurableContext(mockContext, event);
      await wrappedCtx.wait("delay-5min", { minutes: 5 });

      expect(mockStartSpan).toHaveBeenCalledWith("aws.lambda.durable.wait", {
        tags: {
          "durable.operation.type": "wait",
          "durable.operation.name": "delay-5min",
          "resource.name": "delay-5min",
          "durable.wait.duration": '{"minutes":5}',
        },
      });
      expect(mockFinish).toHaveBeenCalled();
    });

    it("skips span for replay", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [
            {
              Id: "wait-delay-5min-1",
              Type: "WAIT",
              Name: "delay-5min",
              Status: "SUCCEEDED" as const,
            },
          ],
        },
      };

      const wrappedCtx = wrapDurableContext(mockContext, event);
      await wrappedCtx.wait("delay-5min", { minutes: 5 });

      expect(mockStartSpan).not.toHaveBeenCalled();
    });
  });

  describe("invoke", () => {
    it("creates span with function name tag", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [] as OperationState[],
        },
      };

      const wrappedCtx = wrapDurableContext(mockContext, event);
      await wrappedCtx.invoke("call-processor", "processor-function", { data: "test" });

      expect(mockStartSpan).toHaveBeenCalledWith("aws.lambda.durable.invoke", {
        tags: {
          "durable.operation.type": "invoke",
          "durable.operation.name": "call-processor",
          "resource.name": "call-processor",
          "durable.invoke.function_name": "processor-function",
        },
      });
      expect(mockFinish).toHaveBeenCalled();
    });

    it("skips span for replay", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [
            {
              Id: "invoke-call-processor-1",
              Type: "INVOKE",
              Name: "call-processor",
              Status: "SUCCEEDED" as const,
            },
          ],
        },
      };

      const wrappedCtx = wrapDurableContext(mockContext, event);
      await wrappedCtx.invoke("call-processor", "processor-function", { data: "test" });

      expect(mockStartSpan).not.toHaveBeenCalled();
    });
  });

  describe("waitForCallback", () => {
    it("creates span for new callback", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [] as OperationState[],
        },
      };

      const wrappedCtx = wrapDurableContext(mockContext, event);
      await wrappedCtx.waitForCallback("approval", async () => {});

      expect(mockStartSpan).toHaveBeenCalledWith("aws.lambda.durable.callback", {
        tags: {
          "durable.operation.type": "callback",
          "durable.operation.name": "approval",
          "resource.name": "approval",
        },
      });
    });
  });

  describe("parallel", () => {
    it("creates span with branch count tag", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [] as OperationState[],
        },
      };

      const branches = [async () => "a", async () => "b", async () => "c"];

      const wrappedCtx = wrapDurableContext(mockContext, event);
      await wrappedCtx.parallel("process-all", branches);

      expect(mockStartSpan).toHaveBeenCalledWith("aws.lambda.durable.parallel", {
        tags: {
          "durable.operation.type": "parallel",
          "durable.operation.name": "process-all",
          "resource.name": "process-all",
          "durable.parallel.branch_count": "3",
        },
      });
    });
  });

  describe("map", () => {
    it("creates span with item count tag", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [] as OperationState[],
        },
      };

      const items = [1, 2, 3, 4, 5];

      const wrappedCtx = wrapDurableContext(mockContext, event);
      await wrappedCtx.map("process-items", items, async (item) => item * 2);

      expect(mockStartSpan).toHaveBeenCalledWith("aws.lambda.durable.map", {
        tags: {
          "durable.operation.type": "map",
          "durable.operation.name": "process-items",
          "resource.name": "process-items",
          "durable.map.item_count": "5",
        },
      });
    });
  });

  describe("preserves original context behavior", () => {
    it("returns result from original step function", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [] as OperationState[],
        },
      };

      (mockContext.step as jest.Mock).mockResolvedValue("custom-result");

      const wrappedCtx = wrapDurableContext(mockContext, event);
      const result = await wrappedCtx.step("my-step", async () => "data");

      expect(result).toBe("custom-result");
    });

    it("passes through options to original step", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [] as OperationState[],
        },
      };

      const options = { retryPolicy: { maxAttempts: 3 } };

      const wrappedCtx = wrapDurableContext(mockContext, event);
      await wrappedCtx.step("my-step", async () => "data", options);

      expect(mockContext.step).toHaveBeenCalledWith("my-step", expect.any(Function), options);
    });
  });

  describe("runInChildContext", () => {
    it("wraps child context recursively", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [] as OperationState[],
        },
      };

      const wrappedCtx = wrapDurableContext(mockContext, event);
      await wrappedCtx.runInChildContext("child-workflow", async (childCtx) => {
        // Child context should also be wrapped
        await childCtx.step("child-step", async () => "child-data");
        return "child-result";
      });

      // Should create spans for both child_context and the nested step
      expect(mockStartSpan).toHaveBeenCalledWith("aws.lambda.durable.child_context", expect.any(Object));
    });
  });

  describe("operation counter tracking", () => {
    it("tracks operation IDs correctly for multiple same-name operations", async () => {
      const event = {
        InitialExecutionState: {
          Operations: [
            {
              Id: "step-1",
              Type: "STEP",
              Name: "fetch",
              Status: "SUCCEEDED" as const,
            },
          ] as OperationState[],
        },
      };

      const wrappedCtx = wrapDurableContext(mockContext, event);

      // First call - should be replay (matches Name="fetch" and Type="STEP")
      await wrappedCtx.step("fetch", async () => "data1");
      expect(mockStartSpan).not.toHaveBeenCalled();

      // Second call - should create span (the first operation is consumed)
      await wrappedCtx.step("fetch", async () => "data2");
      expect(mockStartSpan).toHaveBeenCalled();
    });
  });
});
