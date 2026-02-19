import { parseDurableExecutionArn, extractDurableFunctionContext } from "./durable-function-context";

describe("durable-function-context", () => {
  describe("parseDurableExecutionArn", () => {
    it("returns execution name and ID for a valid ARN", () => {
      const arn =
        "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/order-123/550e8400-e29b-41d4-a716-446655440001";
      const result = parseDurableExecutionArn(arn);

      expect(result).toEqual({
        executionName: "order-123",
        executionId: "550e8400-e29b-41d4-a716-446655440001",
      });
    });

    it("returns undefined for ARN without durable-execution marker", () => {
      const arn = "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST";
      const result = parseDurableExecutionArn(arn);

      expect(result).toBeUndefined();
    });

    it("returns undefined for malformed ARN with only execution name", () => {
      const arn = "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/order-123";
      const result = parseDurableExecutionArn(arn);

      expect(result).toBeUndefined();
    });

    it("returns undefined for malformed ARN with empty execution name", () => {
      const arn =
        "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution//550e8400-e29b-41d4-a716-446655440002";
      const result = parseDurableExecutionArn(arn);

      expect(result).toBeUndefined();
    });

    it("returns undefined for malformed ARN with empty execution ID", () => {
      const arn = "arn:aws:lambda:us-east-1:123456789012:function:my-func:$LATEST/durable-execution/order-123/";
      const result = parseDurableExecutionArn(arn);

      expect(result).toBeUndefined();
    });
  });

  describe("extractDurableFunctionContext", () => {
    it("extracts context from event.DurableExecutionArn", () => {
      const event = {
        DurableExecutionArn:
          "arn:aws:lambda:us-east-1:123456789012:function:my-func:1/durable-execution/my-execution/550e8400-e29b-41d4-a716-446655440004",
        CheckpointToken: "some-token",
        InitialExecutionState: {
          Operations: [],
        },
      };
      const result = extractDurableFunctionContext(event);

      expect(result).toEqual({
        durable_function_execution_name: "my-execution",
        durable_function_execution_id: "550e8400-e29b-41d4-a716-446655440004",
      });
    });

    it("returns undefined for regular Lambda event without DurableExecutionArn", () => {
      const event = {
        body: '{"key": "value"}',
        headers: {
          "Content-Type": "application/json",
        },
      };
      const result = extractDurableFunctionContext(event);

      expect(result).toBeUndefined();
    });

    it("returns undefined when event is null", () => {
      const result = extractDurableFunctionContext(null);

      expect(result).toBeUndefined();
    });

    it("returns undefined when event is undefined", () => {
      const result = extractDurableFunctionContext(undefined);

      expect(result).toBeUndefined();
    });

    it("returns undefined when DurableExecutionArn cannot be parsed", () => {
      const event = {
        DurableExecutionArn: "invalid-arn-without-durable-execution-marker",
      };
      const result = extractDurableFunctionContext(event);

      expect(result).toBeUndefined();
    });
  });
});
