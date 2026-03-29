import { DurableFunctionContextService, PARENT_ID, TRACE_ID } from "./durable-function-service";

describe("DurableFunctionContextService", () => {
  // Use valid trace IDs that fit within 64-bit BigInt constraints (max: 18446744073709551615)
  const validDurableExecutionEvent = {
    DurableExecutionArn:
      "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/order-123/550e8400-e29b-41d4-a716-446655440001",
    CheckpointToken: "some-token",
    InitialExecutionState: {
      Operations: [
        {
          Id: "step-1",
          Type: "STEP",
          Name: "fetch-user",
          Status: "SUCCEEDED",
          ExecutionDetails: {
            InputPayload: JSON.stringify({
              headers: {
                "x-datadog-trace-id": "1234567890123456789",
                "x-datadog-parent-id": "9876543210987654321",
                "x-datadog-sampling-priority": "1",
              },
              body: '{"key": "value"}',
            }),
          },
        },
      ],
    },
  };

  const durableEventWithoutPreservedTrace = {
    DurableExecutionArn:
      "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/order-456/650e8400-e29b-41d4-a716-446655440002",
    CheckpointToken: "some-token",
    InitialExecutionState: {
      Operations: [
        {
          Id: "step-1",
          Type: "STEP",
          Name: "fetch-user",
          Status: "SUCCEEDED",
          ExecutionDetails: {
            InputPayload: JSON.stringify({
              body: '{"key": "value"}',
            }),
          },
        },
      ],
    },
  };

  const durableEventWithDatadogObject = {
    DurableExecutionArn:
      "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/order-789/750e8400-e29b-41d4-a716-446655440003",
    CheckpointToken: "some-token",
    InitialExecutionState: {
      Operations: [
        {
          Id: "step-1",
          Type: "STEP",
          Name: "fetch-user",
          Status: "SUCCEEDED",
          ExecutionDetails: {
            InputPayload: JSON.stringify({
              _datadog: {
                "x-datadog-trace-id": "1111111111111111111",
                "x-datadog-parent-id": "2222222222222222222",
                "x-datadog-sampling-priority": "2",
              },
            }),
          },
        },
      ],
    },
  };

  const durableEventWithSNS = {
    DurableExecutionArn:
      "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/order-sns/850e8400-e29b-41d4-a716-446655440004",
    CheckpointToken: "some-token",
    InitialExecutionState: {
      Operations: [
        {
          Id: "step-1",
          Type: "STEP",
          Status: "SUCCEEDED",
          ExecutionDetails: {
            InputPayload: JSON.stringify({
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
            }),
          },
        },
      ],
    },
  };

  const durableEventWithSQS = {
    DurableExecutionArn:
      "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/order-sqs/950e8400-e29b-41d4-a716-446655440005",
    CheckpointToken: "some-token",
    InitialExecutionState: {
      Operations: [
        {
          Id: "step-1",
          Type: "STEP",
          Status: "SUCCEEDED",
          ExecutionDetails: {
            InputPayload: JSON.stringify({
              Records: [
                {
                  messageAttributes: {
                    _datadog_trace_id: { stringValue: "5555555555555555555" },
                    _datadog_parent_id: { stringValue: "6666666666666666666" },
                  },
                },
              ],
            }),
          },
        },
      ],
    },
  };

  const durableEventWithEventBridge = {
    DurableExecutionArn:
      "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/order-eb/a50e8400-e29b-41d4-a716-446655440006",
    CheckpointToken: "some-token",
    InitialExecutionState: {
      Operations: [
        {
          Id: "step-1",
          Type: "STEP",
          Status: "SUCCEEDED",
          ExecutionDetails: {
            InputPayload: JSON.stringify({
              detail: {
                _datadog: {
                  "x-datadog-trace-id": "7777777777777777777",
                  "x-datadog-parent-id": "8888888888888888888",
                  "x-datadog-sampling-priority": "1",
                },
              },
            }),
          },
        },
      ],
    },
  };

  describe("instance", () => {
    beforeEach(() => {
      DurableFunctionContextService.reset();
    });

    it("returns the same instance every time", () => {
      const instance1 = DurableFunctionContextService.instance(validDurableExecutionEvent);
      const instance2 = DurableFunctionContextService.instance();

      expect(instance1).toBe(instance2);
    });

    it("returns undefined context for non-durable events", () => {
      const instance = DurableFunctionContextService.instance({
        body: '{"key": "value"}',
        headers: {},
      });

      expect(instance.context).toBeUndefined();
    });
  });

  describe("context extraction", () => {
    beforeEach(() => {
      DurableFunctionContextService.reset();
    });

    it("extracts context from valid durable execution event", () => {
      const instance = DurableFunctionContextService.instance(validDurableExecutionEvent);

      expect(instance.context).toEqual({
        durable_function_execution_name: "order-123",
        durable_function_execution_id: "550e8400-e29b-41d4-a716-446655440001",
      });
    });

    it("returns undefined context when DurableExecutionArn is missing", () => {
      const instance = DurableFunctionContextService.instance({
        CheckpointToken: "some-token",
      });

      expect(instance.context).toBeUndefined();
    });
  });

  describe("spanContext", () => {
    beforeEach(() => {
      DurableFunctionContextService.reset();
    });

    it("extracts trace from preserved HTTP headers", () => {
      const instance = DurableFunctionContextService.instance(validDurableExecutionEvent);

      const spanContext = instance.spanContext;

      expect(spanContext).not.toBeNull();
      expect(spanContext?.toTraceId()).toBe("1234567890123456789");
      expect(spanContext?.toSpanId()).toBe("9876543210987654321");
      expect(spanContext?.source).toBe("event");
    });

    it("extracts trace from preserved _datadog object", () => {
      const instance = DurableFunctionContextService.instance(durableEventWithDatadogObject);

      const spanContext = instance.spanContext;

      expect(spanContext).not.toBeNull();
      expect(spanContext?.toTraceId()).toBe("1111111111111111111");
      expect(spanContext?.toSpanId()).toBe("2222222222222222222");
    });

    it("extracts trace from preserved SNS attributes", () => {
      const instance = DurableFunctionContextService.instance(durableEventWithSNS);

      const spanContext = instance.spanContext;

      expect(spanContext).not.toBeNull();
      expect(spanContext?.toTraceId()).toBe("3333333333333333333");
      expect(spanContext?.toSpanId()).toBe("4444444444444444444");
    });

    it("extracts trace from preserved SQS attributes", () => {
      const instance = DurableFunctionContextService.instance(durableEventWithSQS);

      const spanContext = instance.spanContext;

      expect(spanContext).not.toBeNull();
      expect(spanContext?.toTraceId()).toBe("5555555555555555555");
      expect(spanContext?.toSpanId()).toBe("6666666666666666666");
    });

    it("extracts trace from preserved EventBridge detail", () => {
      const instance = DurableFunctionContextService.instance(durableEventWithEventBridge);

      const spanContext = instance.spanContext;

      expect(spanContext).not.toBeNull();
      expect(spanContext?.toTraceId()).toBe("7777777777777777777");
      expect(spanContext?.toSpanId()).toBe("8888888888888888888");
    });

    it("falls back to deterministic when no preserved trace", () => {
      const instance = DurableFunctionContextService.instance(durableEventWithoutPreservedTrace);

      const spanContext = instance.spanContext;

      expect(spanContext).not.toBeNull();
      // Deterministic IDs should be based on execution ID
      expect(spanContext?.toTraceId()).toBeDefined();
      expect(spanContext?.toSpanId()).toBeDefined();
      // Trace ID should be consistent for the same execution ID
      const spanContext2 = instance.spanContext;
      expect(spanContext?.toTraceId()).toBe(spanContext2?.toTraceId());
    });

    it("returns null when context is not set", () => {
      const instance = DurableFunctionContextService.instance({});

      const spanContext = instance.spanContext;

      expect(spanContext).toBeNull();
    });
  });

  describe("deterministicSha256HashToBigIntString", () => {
    beforeEach(() => {
      DurableFunctionContextService.reset();
    });

    it("generates deterministic trace ID (same input = same output)", () => {
      const instance = DurableFunctionContextService.instance(durableEventWithoutPreservedTrace);
      const hash1 = instance["deterministicSha256HashToBigIntString"]("650e8400-e29b-41d4-a716-446655440002", TRACE_ID);
      const hash2 = instance["deterministicSha256HashToBigIntString"]("650e8400-e29b-41d4-a716-446655440002", TRACE_ID);
      expect(hash1).toEqual(hash2);
    });

    it("different execution IDs produce different trace IDs", () => {
      const instance = DurableFunctionContextService.instance(durableEventWithoutPreservedTrace);
      const hash1 = instance["deterministicSha256HashToBigIntString"]("650e8400-e29b-41d4-a716-446655440002", TRACE_ID);
      const hash2 = instance["deterministicSha256HashToBigIntString"]("750e8400-e29b-41d4-a716-446655440003", TRACE_ID);
      expect(hash1).not.toEqual(hash2);
    });

    it("returns different hashes for TRACE_ID and PARENT_ID types", () => {
      const instance = DurableFunctionContextService.instance(durableEventWithoutPreservedTrace);
      const traceHash = instance["deterministicSha256HashToBigIntString"](
        "650e8400-e29b-41d4-a716-446655440002",
        TRACE_ID,
      );
      const parentHash = instance["deterministicSha256HashToBigIntString"](
        "650e8400-e29b-41d4-a716-446655440002",
        PARENT_ID,
      );
      expect(traceHash).not.toEqual(parentHash);
    });
  });

  describe("reset", () => {
    it("clears the singleton instance", () => {
      const instance1 = DurableFunctionContextService.instance(validDurableExecutionEvent);
      expect(instance1.context).toBeDefined();

      DurableFunctionContextService.reset();

      const instance2 = DurableFunctionContextService.instance({});
      expect(instance2.context).toBeUndefined();
      expect(instance1).not.toBe(instance2);
    });
  });
});
