// Mock the durable execution SDK
const mockOriginalWithDurableExecution = jest.fn((handler) => {
  return async (event: any, context: any) => {
    // Simulate the SDK's behavior of passing ctx
    const mockCtx = {
      step: jest.fn().mockResolvedValue("step-result"),
      wait: jest.fn().mockResolvedValue(undefined),
      invoke: jest.fn().mockResolvedValue("invoke-result"),
      waitForCallback: jest.fn().mockResolvedValue("callback-result"),
      parallel: jest.fn().mockResolvedValue([]),
      map: jest.fn().mockResolvedValue([]),
    };
    return handler(event, mockCtx);
  };
});

// Create the mock SDK object that will be modified by the patching
const mockDurableSDK = {
  withDurableExecution: mockOriginalWithDurableExecution,
};

// Set up the mock before any imports that might trigger require()
jest.mock("@aws/durable-execution-sdk-js", () => mockDurableSDK, { virtual: true });

import {
  initDurableFunctionTracing,
  isDurableFunctionTracingEnabled,
  resetDurableFunctionPatch,
} from "./durable-function-patch";

describe("durable-function-patch", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetDurableFunctionPatch();
    process.env = { ...originalEnv };

    // Reset the mock SDK function to original
    mockDurableSDK.withDurableExecution = mockOriginalWithDurableExecution;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("initDurableFunctionTracing", () => {
    it("patches withDurableExecution when SDK is present", () => {
      initDurableFunctionTracing();

      expect(isDurableFunctionTracingEnabled()).toBe(true);
      // The original function should be replaced
      expect(mockDurableSDK.withDurableExecution).not.toBe(mockOriginalWithDurableExecution);
    });

    it("respects DD_DISABLE_DURABLE_FUNCTION_TRACING env var", () => {
      process.env.DD_DISABLE_DURABLE_FUNCTION_TRACING = "true";

      initDurableFunctionTracing();

      expect(isDurableFunctionTracingEnabled()).toBe(false);
    });

    it("only patches once (idempotent)", () => {
      initDurableFunctionTracing();
      const firstPatchedFunction = mockDurableSDK.withDurableExecution;

      initDurableFunctionTracing();
      const secondPatchedFunction = mockDurableSDK.withDurableExecution;

      // Should be the same patched function
      expect(firstPatchedFunction).toBe(secondPatchedFunction);
      expect(isDurableFunctionTracingEnabled()).toBe(true);
    });
  });

  describe("wrapped handler behavior", () => {
    it("wrapped handler receives traced context", async () => {
      initDurableFunctionTracing();

      // Create a handler using the patched SDK
      const userHandler = jest.fn().mockResolvedValue("handler-result");
      const wrappedHandler = mockDurableSDK.withDurableExecution(userHandler);

      // Invoke the wrapped handler
      const event = { test: "event" };
      const result = await wrappedHandler(event, {});

      // User handler should be called with the event and a context
      expect(userHandler).toHaveBeenCalled();
      const [receivedEvent, receivedCtx] = userHandler.mock.calls[0];
      expect(receivedEvent).toEqual(event);
      // Context should have wrapped methods (step, wait, etc.)
      expect(receivedCtx.step).toBeDefined();
      expect(receivedCtx.wait).toBeDefined();
      expect(receivedCtx.invoke).toBeDefined();
    });

    it("original handler behavior preserved", async () => {
      initDurableFunctionTracing();

      const userHandler = jest.fn().mockResolvedValue("expected-result");
      const wrappedHandler = mockDurableSDK.withDurableExecution(userHandler);

      const result = await wrappedHandler({ test: "event" }, {});

      expect(result).toBe("expected-result");
    });

    it("preserves options passed to withDurableExecution", () => {
      // Track if original was called with options
      const originalMock = jest.fn((handler: any, options?: any) => {
        return async () => handler({}, {});
      });
      (mockDurableSDK as any).withDurableExecution = originalMock;

      initDurableFunctionTracing();

      const userHandler = jest.fn();
      const options = { timeout: 30000 };

      (mockDurableSDK as any).withDurableExecution(userHandler, options);

      expect(originalMock).toHaveBeenCalledWith(expect.any(Function), options);
    });
  });

  describe("isDurableFunctionTracingEnabled", () => {
    it("returns false before initialization", () => {
      expect(isDurableFunctionTracingEnabled()).toBe(false);
    });

    it("returns true after successful initialization", () => {
      initDurableFunctionTracing();

      expect(isDurableFunctionTracingEnabled()).toBe(true);
    });
  });

  describe("resetDurableFunctionPatch", () => {
    it("resets patch state for testing", () => {
      initDurableFunctionTracing();
      expect(isDurableFunctionTracingEnabled()).toBe(true);

      resetDurableFunctionPatch();
      expect(isDurableFunctionTracingEnabled()).toBe(false);
    });
  });
});
