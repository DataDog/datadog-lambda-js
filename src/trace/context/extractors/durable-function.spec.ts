import { DurableFunctionEventTraceExtractor } from "./durable-function";
import { DurableFunctionContextService } from "../../durable-function-service";

describe("DurableFunctionEventTraceExtractor", () => {
  const validDurableExecutionEvent = {
    DurableExecutionArn:
      "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/order-123/550e8400-e29b-41d4-a716-446655440001",
    CheckpointToken: "some-token",
    InitialExecutionState: {
      Operations: [
        {
          Id: "step-1",
          Type: "STEP",
          Status: "SUCCEEDED",
          ExecutionDetails: {
            InputPayload: JSON.stringify({
              headers: {
                "x-datadog-trace-id": "12345678901234567890",
                "x-datadog-parent-id": "9876543210987654321",
              },
            }),
          },
        },
      ],
    },
  };

  const regularLambdaEvent = {
    body: '{"key": "value"}',
    headers: {
      "Content-Type": "application/json",
    },
  };

  beforeEach(() => {
    DurableFunctionContextService.reset();
  });

  describe("extract", () => {
    it("extracts span context from valid durable execution event", () => {
      const extractor = new DurableFunctionEventTraceExtractor();

      const spanContext = extractor.extract(validDurableExecutionEvent);

      expect(spanContext).not.toBeNull();
      expect(spanContext?.toTraceId()).toBe("12345678901234567890");
      expect(spanContext?.toSpanId()).toBe("9876543210987654321");
      expect(spanContext?.source).toBe("event");
    });

    it("returns null for regular Lambda event", () => {
      const extractor = new DurableFunctionEventTraceExtractor();

      const spanContext = extractor.extract(regularLambdaEvent);

      expect(spanContext).toBeNull();
    });

    it("returns null for null event", () => {
      const extractor = new DurableFunctionEventTraceExtractor();

      const spanContext = extractor.extract(null);

      expect(spanContext).toBeNull();
    });

    it("returns null for undefined event", () => {
      const extractor = new DurableFunctionEventTraceExtractor();

      const spanContext = extractor.extract(undefined);

      expect(spanContext).toBeNull();
    });

    it("returns null for event with invalid DurableExecutionArn", () => {
      const extractor = new DurableFunctionEventTraceExtractor();

      const spanContext = extractor.extract({
        DurableExecutionArn: "invalid-arn",
      });

      expect(spanContext).toBeNull();
    });

    it("extracts deterministic span context when no preserved trace headers", () => {
      const eventWithoutPreservedTrace = {
        DurableExecutionArn:
          "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/order-456/650e8400-e29b-41d4-a716-446655440002",
        CheckpointToken: "some-token",
        InitialExecutionState: {
          Operations: [
            {
              Id: "step-1",
              Type: "STEP",
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

      const extractor = new DurableFunctionEventTraceExtractor();

      const spanContext = extractor.extract(eventWithoutPreservedTrace);

      expect(spanContext).not.toBeNull();
      // Should have deterministic IDs based on execution ID
      expect(spanContext?.toTraceId()).toBeDefined();
      expect(spanContext?.toSpanId()).toBeDefined();
    });

    it("uses singleton service instance", () => {
      const extractor = new DurableFunctionEventTraceExtractor();

      // First extraction
      extractor.extract(validDurableExecutionEvent);
      const instance1 = DurableFunctionContextService.instance();

      // Second extraction with same event
      extractor.extract(validDurableExecutionEvent);
      const instance2 = DurableFunctionContextService.instance();

      expect(instance1).toBe(instance2);
    });
  });
});
