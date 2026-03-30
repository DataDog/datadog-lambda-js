/**
 * Integration tests for durable function tracing.
 *
 * These tests verify that all components (service, context wrapper, patch,
 * extractor) work together end-to-end. Unlike the unit tests that mock
 * each component in isolation, these tests exercise the real wiring between
 * components, only mocking dd-trace itself (since we are not running inside
 * a traced Lambda environment).
 */

// ---------------------------------------------------------------------------
// Mock dd-trace -- we need this because dd-trace is not available outside
// a real Lambda environment. We capture every span that is created so we can
// assert on the hierarchy and tags.
// ---------------------------------------------------------------------------

interface MockSpan {
  operationName: string;
  tags: Record<string, any>;
  finished: boolean;
}

const createdSpans: MockSpan[] = [];

const makeMockSpan = (operationName: string, tags: Record<string, any>): any => {
  const span: MockSpan = { operationName, tags: { ...tags }, finished: false };
  createdSpans.push(span);
  return {
    finish: () => {
      span.finished = true;
    },
    setTag: (key: string, value: any) => {
      span.tags[key] = value;
    },
  };
};

jest.mock("dd-trace", () => ({
  startSpan: (operationName: string, opts?: { tags?: Record<string, any> }) => {
    return makeMockSpan(operationName, opts?.tags ?? {});
  },
}));

// Mock dd-trace internals used by DurableFunctionContextService.spanContext
jest.mock("dd-trace/packages/dd-trace/src/opentracing/span_context", () => {
  return class MockDatadogSpanContext {
    _traceId: any;
    _spanId: any;
    _sampling: any;
    _trace: { tags: Record<string, any> };

    constructor({ traceId, spanId, sampling }: any) {
      this._traceId = traceId;
      this._spanId = spanId;
      this._sampling = sampling;
      this._trace = { tags: {} };
    }

    toTraceId() {
      return this._traceId.toString(10);
    }

    toSpanId() {
      return this._spanId.toString(10);
    }
  };
});

jest.mock("dd-trace/packages/dd-trace/src/id", () => {
  return (value: string, radix: number) => {
    const big = BigInt(value);
    return {
      toString: (base?: number) => big.toString(base ?? 10),
    };
  };
});

// ---------------------------------------------------------------------------
// Mock the durable execution SDK so that initDurableFunctionTracing can patch it.
// We keep a reference so we can observe patching and invoke handlers through it.
// ---------------------------------------------------------------------------

import { DurableExecutionContext, OperationState } from "./durable-function-context-wrapper";

const createMockDurableContext = (overrides?: Partial<DurableExecutionContext>): DurableExecutionContext => ({
  step: jest.fn().mockImplementation(async (_name: string, fn: () => Promise<any>) => fn()),
  wait: jest.fn().mockResolvedValue(undefined),
  invoke: jest.fn().mockImplementation(async (_name: string, _fn: string, _payload?: any) => "invoke-result"),
  waitForCallback: jest.fn().mockImplementation(async (_name: string, fn: (id: string) => Promise<void>) => {
    await fn("callback-id-123");
    return "callback-result";
  }),
  parallel: jest.fn().mockImplementation(async (_name: string, branches: (() => Promise<any>)[]) => {
    return Promise.all(branches.map((b) => b()));
  }),
  map: jest.fn().mockImplementation(async (_name: string, items: any[], fn: (item: any) => Promise<any>) => {
    return Promise.all(items.map(fn));
  }),
  runInChildContext: jest.fn().mockImplementation(async (_name: string, fn: (ctx: DurableExecutionContext) => Promise<any>) => {
    // Simulate the SDK by creating a fresh child context and passing it to fn
    const childCtx = createMockDurableContext();
    return fn(childCtx);
  }),
  ...overrides,
});

// The mock SDK -- initDurableFunctionTracing will patch withDurableExecution on this object.
const mockSDK = {
  withDurableExecution: (handler: (event: any, ctx: DurableExecutionContext) => Promise<any>) => {
    return async (event: any) => {
      const ctx = createMockDurableContext();
      return handler(event, ctx);
    };
  },
};

jest.mock("@aws/durable-execution-sdk-js", () => mockSDK, { virtual: true });

// ---------------------------------------------------------------------------
// Now import the real modules under test
// ---------------------------------------------------------------------------

import { DurableFunctionContextService } from "./durable-function-service";
import { wrapDurableContext } from "./durable-function-context-wrapper";
import {
  initDurableFunctionTracing,
  isDurableFunctionTracingEnabled,
  resetDurableFunctionPatch,
} from "./durable-function-patch";
import { DurableFunctionEventTraceExtractor } from "./context/extractors/durable-function";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a realistic durable execution event. */
function buildDurableEvent(opts: {
  executionName: string;
  executionId: string;
  preservedPayload?: any;
  operations?: OperationState[];
}): any {
  const firstOp: any = {
    Id: "init-1",
    Type: "STEP",
    Name: "init",
    Status: "SUCCEEDED",
  };
  if (opts.preservedPayload !== undefined) {
    firstOp.ExecutionDetails = {
      InputPayload: JSON.stringify(opts.preservedPayload),
    };
  }

  return {
    DurableExecutionArn: `arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/${opts.executionName}/${opts.executionId}`,
    CheckpointToken: "token-abc",
    InitialExecutionState: {
      Operations: [firstOp, ...(opts.operations ?? [])],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Durable Function Tracing - Integration", () => {
  beforeEach(() => {
    createdSpans.length = 0;
    DurableFunctionContextService.reset();
    resetDurableFunctionPatch();
    delete process.env.DD_DISABLE_DURABLE_FUNCTION_TRACING;
  });

  // =========================================================================
  // Scenario 1: API Gateway -> Durable Function with operations
  // =========================================================================
  describe("Scenario 1: API Gateway trigger with preserved trace headers", () => {
    const apiGatewayPayload = {
      headers: {
        "x-datadog-trace-id": "1234567890123456789",
        "x-datadog-parent-id": "9876543210987654321",
        "x-datadog-sampling-priority": "1",
        "Content-Type": "application/json",
      },
      body: '{"orderId": "order-42"}',
    };

    const event = buildDurableEvent({
      executionName: "order-42",
      executionId: "exec-aaa-bbb-111",
      preservedPayload: apiGatewayPayload,
    });

    it("extractor returns span context with trace ID from preserved headers", () => {
      const extractor = new DurableFunctionEventTraceExtractor();
      const spanCtx = extractor.extract(event);

      expect(spanCtx).not.toBeNull();
      expect(spanCtx!.toTraceId()).toBe("1234567890123456789");
      expect(spanCtx!.toSpanId()).toBe("9876543210987654321");
      expect(spanCtx!.source).toBe("event");
    });

    it("service and extractor agree on the span context", () => {
      // First use the service directly
      const service = DurableFunctionContextService.instance(event);
      const serviceCtx = service.spanContext;

      // Reset and use the extractor (which internally uses the service)
      DurableFunctionContextService.reset();
      const extractor = new DurableFunctionEventTraceExtractor();
      const extractorCtx = extractor.extract(event);

      expect(serviceCtx).not.toBeNull();
      expect(extractorCtx).not.toBeNull();
      expect(serviceCtx!.toTraceId()).toBe(extractorCtx!.toTraceId());
      expect(serviceCtx!.toSpanId()).toBe(extractorCtx!.toSpanId());
    });

    it("context wrapper creates operation spans for step, wait, invoke", async () => {
      const ctx = createMockDurableContext();
      const wrappedCtx = wrapDurableContext(ctx, event);

      await wrappedCtx.step("fetch-user", async () => ({ name: "Alice" }));
      await wrappedCtx.wait("delay", { seconds: 30 });
      await wrappedCtx.invoke("send-email", "email-sender-fn", { to: "alice@example.com" });

      expect(createdSpans).toHaveLength(3);

      // Step span
      expect(createdSpans[0].operationName).toBe("aws.lambda.durable.step");
      expect(createdSpans[0].tags["durable.operation.type"]).toBe("step");
      expect(createdSpans[0].tags["durable.operation.name"]).toBe("fetch-user");
      expect(createdSpans[0].finished).toBe(true);

      // Wait span
      expect(createdSpans[1].operationName).toBe("aws.lambda.durable.wait");
      expect(createdSpans[1].tags["durable.operation.type"]).toBe("wait");
      expect(createdSpans[1].tags["durable.operation.name"]).toBe("delay");
      expect(createdSpans[1].tags["durable.wait.duration"]).toBe('{"seconds":30}');
      expect(createdSpans[1].finished).toBe(true);

      // Invoke span
      expect(createdSpans[2].operationName).toBe("aws.lambda.durable.invoke");
      expect(createdSpans[2].tags["durable.operation.type"]).toBe("invoke");
      expect(createdSpans[2].tags["durable.operation.name"]).toBe("send-email");
      expect(createdSpans[2].tags["durable.invoke.function_name"]).toBe("email-sender-fn");
      expect(createdSpans[2].finished).toBe(true);
    });

    it("durable_function_execution_id tag is available from service context", () => {
      const service = DurableFunctionContextService.instance(event);
      expect(service.context).toBeDefined();
      expect(service.context!.durable_function_execution_id).toBe("exec-aaa-bbb-111");
      expect(service.context!.durable_function_execution_name).toBe("order-42");
    });
  });

  // =========================================================================
  // Scenario 2: Direct invoke with replay
  // =========================================================================
  describe("Scenario 2: Direct invoke with replayed and live operations", () => {
    const event = buildDurableEvent({
      executionName: "workflow-99",
      executionId: "exec-ccc-ddd-222",
      // No trace headers in preserved payload
      preservedPayload: { action: "process", data: [1, 2, 3] },
      operations: [
        // These two are replayed (already completed)
        { Id: "step-1", Type: "STEP", Name: "validate", Status: "SUCCEEDED" },
        { Id: "wait-1", Type: "WAIT", Name: "cooldown", Status: "SUCCEEDED" },
        // This one failed in a previous attempt
        { Id: "invoke-1", Type: "INVOKE", Name: "notify", Status: "FAILED" },
      ],
    });

    it("generates deterministic trace ID when no parent headers", () => {
      const service = DurableFunctionContextService.instance(event);
      const spanCtx = service.spanContext;

      expect(spanCtx).not.toBeNull();
      const traceId = spanCtx!.toTraceId();
      const spanId = spanCtx!.toSpanId();

      // Deterministic: same execution ID should yield same IDs
      DurableFunctionContextService.reset();
      const service2 = DurableFunctionContextService.instance(event);
      const spanCtx2 = service2.spanContext;

      expect(spanCtx2!.toTraceId()).toBe(traceId);
      expect(spanCtx2!.toSpanId()).toBe(spanId);
    });

    it("replayed operations do NOT create spans, live operations DO", async () => {
      const ctx = createMockDurableContext();
      const wrappedCtx = wrapDurableContext(ctx, event);

      // "validate" step -- matches replayed operation (SUCCEEDED), should skip span
      await wrappedCtx.step("validate", async () => "validated");
      expect(createdSpans).toHaveLength(0);

      // "cooldown" wait -- matches replayed operation (SUCCEEDED), should skip span
      await wrappedCtx.wait("cooldown", { minutes: 1 });
      expect(createdSpans).toHaveLength(0);

      // "notify" invoke -- matches FAILED operation, still considered replay, should skip span
      await wrappedCtx.invoke("notify", "notifier-fn");
      expect(createdSpans).toHaveLength(0);

      // "process-results" step -- no matching replay operation, should create span
      await wrappedCtx.step("process-results", async () => "done");
      expect(createdSpans).toHaveLength(1);
      expect(createdSpans[0].operationName).toBe("aws.lambda.durable.step");
      expect(createdSpans[0].tags["durable.operation.name"]).toBe("process-results");
      expect(createdSpans[0].finished).toBe(true);
    });

    it("second call to same-name operation creates span after replay is consumed", async () => {
      // Event with only one "fetch" replay
      const singleReplayEvent = buildDurableEvent({
        executionName: "wf-dup",
        executionId: "exec-dup-111",
        operations: [{ Id: "step-1", Type: "STEP", Name: "fetch", Status: "SUCCEEDED" }],
      });

      const ctx = createMockDurableContext();
      const wrappedCtx = wrapDurableContext(ctx, singleReplayEvent);

      // First "fetch" -- replay, no span
      await wrappedCtx.step("fetch", async () => "cached");
      expect(createdSpans).toHaveLength(0);

      // Second "fetch" -- replay consumed, should create span
      await wrappedCtx.step("fetch", async () => "fresh");
      expect(createdSpans).toHaveLength(1);
      expect(createdSpans[0].tags["durable.operation.name"]).toBe("fetch");
    });
  });

  // =========================================================================
  // Scenario 3: Full pipeline -- patch -> extract -> wrap -> spans
  // =========================================================================
  describe("Scenario 3: Full pipeline through patch, extract, wrap, spans", () => {
    const apiPayload = {
      headers: {
        "x-datadog-trace-id": "5555555555555555555",
        "x-datadog-parent-id": "6666666666666666666",
        "x-datadog-sampling-priority": "2",
      },
      body: "{}",
    };

    const event = buildDurableEvent({
      executionName: "full-pipeline",
      executionId: "exec-full-001",
      preservedPayload: apiPayload,
    });

    it("initDurableFunctionTracing patches the SDK successfully", () => {
      initDurableFunctionTracing();
      expect(isDurableFunctionTracingEnabled()).toBe(true);
    });

    it("patched withDurableExecution auto-wraps context and creates spans", async () => {
      initDurableFunctionTracing();

      // User writes their handler normally
      const userHandler = async (ev: any, ctx: DurableExecutionContext) => {
        await ctx.step("step-a", async () => "result-a");
        await ctx.step("step-b", async () => "result-b");
        return "handler-done";
      };

      // Wrap with patched SDK
      const lambdaHandler = mockSDK.withDurableExecution(userHandler);

      // Invoke
      const result = await lambdaHandler(event);
      expect(result).toBe("handler-done");

      // The patch should have auto-wrapped the context, creating spans
      expect(createdSpans.length).toBeGreaterThanOrEqual(2);
      expect(createdSpans[0].operationName).toBe("aws.lambda.durable.step");
      expect(createdSpans[0].tags["durable.operation.name"]).toBe("step-a");
      expect(createdSpans[1].operationName).toBe("aws.lambda.durable.step");
      expect(createdSpans[1].tags["durable.operation.name"]).toBe("step-b");
    });

    it("extractor returns correct span context alongside wrapper spans", () => {
      const extractor = new DurableFunctionEventTraceExtractor();
      const spanCtx = extractor.extract(event);

      expect(spanCtx).not.toBeNull();
      expect(spanCtx!.toTraceId()).toBe("5555555555555555555");
      expect(spanCtx!.toSpanId()).toBe("6666666666666666666");
    });

    it("everything works together without manual wiring", async () => {
      // 1. Patch the SDK
      initDurableFunctionTracing();

      // 2. Extract trace context (as the datadog-lambda-js wrapper would)
      const extractor = new DurableFunctionEventTraceExtractor();
      const parentSpanCtx = extractor.extract(event);
      expect(parentSpanCtx).not.toBeNull();
      expect(parentSpanCtx!.toTraceId()).toBe("5555555555555555555");

      // Reset singleton so the handler invocation gets a fresh one
      DurableFunctionContextService.reset();

      // 3. Invoke through the patched SDK
      const userHandler = async (ev: any, ctx: DurableExecutionContext) => {
        await ctx.step("pipeline-step", async () => "pipeline-data");
        return "pipeline-done";
      };

      const lambdaHandler = mockSDK.withDurableExecution(userHandler);
      const result = await lambdaHandler(event);

      expect(result).toBe("pipeline-done");
      expect(createdSpans.length).toBeGreaterThanOrEqual(1);
      expect(createdSpans[0].tags["durable.operation.name"]).toBe("pipeline-step");
      expect(createdSpans[0].finished).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 4: Disable flag
  // =========================================================================
  describe("Scenario 4: DD_DISABLE_DURABLE_FUNCTION_TRACING disables patching", () => {
    it("does not patch when env var is set to true", () => {
      process.env.DD_DISABLE_DURABLE_FUNCTION_TRACING = "true";

      initDurableFunctionTracing();

      expect(isDurableFunctionTracingEnabled()).toBe(false);
    });

    it("patches normally when env var is not set", () => {
      delete process.env.DD_DISABLE_DURABLE_FUNCTION_TRACING;

      initDurableFunctionTracing();

      expect(isDurableFunctionTracingEnabled()).toBe(true);
    });

    it("patches normally when env var is set to something other than true", () => {
      process.env.DD_DISABLE_DURABLE_FUNCTION_TRACING = "false";

      initDurableFunctionTracing();

      expect(isDurableFunctionTracingEnabled()).toBe(true);
    });
  });

  // =========================================================================
  // Cross-cutting assertions
  // =========================================================================
  describe("Cross-cutting: tags and error handling", () => {
    it("error operations get error:true tag", async () => {
      const event = buildDurableEvent({
        executionName: "err-wf",
        executionId: "exec-err-001",
      });

      const ctx = createMockDurableContext({
        step: jest.fn().mockRejectedValue(new Error("DB connection failed")),
      });

      const wrappedCtx = wrapDurableContext(ctx, event);

      await expect(wrappedCtx.step("db-query", async () => "data")).rejects.toThrow("DB connection failed");

      expect(createdSpans).toHaveLength(1);
      expect(createdSpans[0].tags["error"]).toBe(true);
      expect(createdSpans[0].tags["error.message"]).toBe("DB connection failed");
      expect(createdSpans[0].tags["error.type"]).toBe("Error");
      expect(createdSpans[0].finished).toBe(true);
    });

    it("parallel and map spans include count tags", async () => {
      const event = buildDurableEvent({
        executionName: "batch-wf",
        executionId: "exec-batch-001",
      });

      const ctx = createMockDurableContext();
      const wrappedCtx = wrapDurableContext(ctx, event);

      await wrappedCtx.parallel("fan-out", [async () => 1, async () => 2, async () => 3]);
      await wrappedCtx.map("process-items", ["a", "b"], async (item) => item.toUpperCase());

      expect(createdSpans).toHaveLength(2);
      expect(createdSpans[0].tags["durable.parallel.branch_count"]).toBe("3");
      expect(createdSpans[1].tags["durable.map.item_count"]).toBe("2");
    });

    it("consistent trace ID across multiple invocations of the same execution", () => {
      const executionId = "exec-consistent-999";
      const event = buildDurableEvent({
        executionName: "consistent-wf",
        executionId,
        preservedPayload: { noHeaders: true },
      });

      // Simulate first invocation
      const service1 = DurableFunctionContextService.instance(event);
      const ctx1 = service1.spanContext;

      // Simulate second invocation (reset singleton as Lambda would between invocations)
      DurableFunctionContextService.reset();
      const service2 = DurableFunctionContextService.instance(event);
      const ctx2 = service2.spanContext;

      expect(ctx1).not.toBeNull();
      expect(ctx2).not.toBeNull();
      expect(ctx1!.toTraceId()).toBe(ctx2!.toTraceId());
      expect(ctx1!.toSpanId()).toBe(ctx2!.toSpanId());
    });

    it("trace connects to parent when triggered with HTTP headers", () => {
      const event = buildDurableEvent({
        executionName: "parent-trace-wf",
        executionId: "exec-parent-001",
        preservedPayload: {
          headers: {
            "x-datadog-trace-id": "9999999999999999999",
            "x-datadog-parent-id": "8888888888888888888",
            "x-datadog-sampling-priority": "2",
          },
        },
      });

      const service = DurableFunctionContextService.instance(event);
      const spanCtx = service.spanContext;

      expect(spanCtx).not.toBeNull();
      // Should use the parent's trace ID, not a deterministic one
      expect(spanCtx!.toTraceId()).toBe("9999999999999999999");
      expect(spanCtx!.toSpanId()).toBe("8888888888888888888");
      expect(spanCtx!.sampleMode()).toBe(2);
    });

    it("_datadog object source also connects to parent", () => {
      const event = buildDurableEvent({
        executionName: "dd-obj-wf",
        executionId: "exec-dd-001",
        preservedPayload: {
          _datadog: {
            "x-datadog-trace-id": "1111111111111111111",
            "x-datadog-parent-id": "2222222222222222222",
          },
        },
      });

      const service = DurableFunctionContextService.instance(event);
      const spanCtx = service.spanContext;

      expect(spanCtx).not.toBeNull();
      expect(spanCtx!.toTraceId()).toBe("1111111111111111111");
      expect(spanCtx!.toSpanId()).toBe("2222222222222222222");
    });

    it("SNS source connects to parent", () => {
      const event = buildDurableEvent({
        executionName: "sns-wf",
        executionId: "exec-sns-001",
        preservedPayload: {
          Records: [
            {
              Sns: {
                MessageAttributes: {
                  "_datadog.trace-id": { Value: "3333333333333333333" },
                  "_datadog.parent-id": { Value: "4444444444444444444" },
                },
              },
            },
          ],
        },
      });

      const service = DurableFunctionContextService.instance(event);
      const spanCtx = service.spanContext;

      expect(spanCtx).not.toBeNull();
      expect(spanCtx!.toTraceId()).toBe("3333333333333333333");
      expect(spanCtx!.toSpanId()).toBe("4444444444444444444");
    });

    it("SQS source connects to parent", () => {
      const event = buildDurableEvent({
        executionName: "sqs-wf",
        executionId: "exec-sqs-001",
        preservedPayload: {
          Records: [
            {
              messageAttributes: {
                _datadog_trace_id: { stringValue: "5555555555555555555" },
                _datadog_parent_id: { stringValue: "6666666666666666666" },
              },
            },
          ],
        },
      });

      const service = DurableFunctionContextService.instance(event);
      const spanCtx = service.spanContext;

      expect(spanCtx).not.toBeNull();
      expect(spanCtx!.toTraceId()).toBe("5555555555555555555");
      expect(spanCtx!.toSpanId()).toBe("6666666666666666666");
    });

    it("EventBridge source connects to parent", () => {
      const event = buildDurableEvent({
        executionName: "eb-wf",
        executionId: "exec-eb-001",
        preservedPayload: {
          detail: {
            _datadog: {
              "x-datadog-trace-id": "7777777777777777777",
              "x-datadog-parent-id": "8888888888888888888",
              "x-datadog-sampling-priority": "1",
            },
          },
        },
      });

      const service = DurableFunctionContextService.instance(event);
      const spanCtx = service.spanContext;

      expect(spanCtx).not.toBeNull();
      expect(spanCtx!.toTraceId()).toBe("7777777777777777777");
      expect(spanCtx!.toSpanId()).toBe("8888888888888888888");
    });
  });
});
