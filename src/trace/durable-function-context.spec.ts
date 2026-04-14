import {
  parseDurableExecutionArn,
  extractDurableFunctionContext,
  extractDurableExecutionStatus,
} from "./durable-function-context";

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
        "aws_lambda.durable_function.execution_name": "my-execution",
        "aws_lambda.durable_function.execution_id": "550e8400-e29b-41d4-a716-446655440004",
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

  describe("extractDurableExecutionStatus", () => {
    const durableEvent = {
      DurableExecutionArn: "arn:aws:lambda:us-east-1:123456789012:function:my-func:1/durable-execution/exec/id-1",
    };

    it("returns SUCCEEDED for a durable invocation with Status SUCCEEDED", () => {
      expect(extractDurableExecutionStatus({ Status: "SUCCEEDED" }, durableEvent)).toBe("SUCCEEDED");
    });

    it("returns FAILED for a durable invocation with Status FAILED", () => {
      expect(extractDurableExecutionStatus({ Status: "FAILED" }, durableEvent)).toBe("FAILED");
    });

    it("returns STOPPED for a durable invocation with Status STOPPED", () => {
      expect(extractDurableExecutionStatus({ Status: "STOPPED" }, durableEvent)).toBe("STOPPED");
    });

    it("returns TIMED_OUT for a durable invocation with Status TIMED_OUT", () => {
      expect(extractDurableExecutionStatus({ Status: "TIMED_OUT" }, durableEvent)).toBe("TIMED_OUT");
    });

    it("returns undefined for unrecognized status value", () => {
      expect(extractDurableExecutionStatus({ Status: "RUNNING" }, durableEvent)).toBeUndefined();
    });

    it("returns undefined when Status field is absent from result", () => {
      expect(extractDurableExecutionStatus({}, durableEvent)).toBeUndefined();
    });

    it("returns undefined when event does not have DurableExecutionArn", () => {
      const nonDurableEvent = { body: '{"key":"value"}' };
      expect(extractDurableExecutionStatus({ Status: "SUCCEEDED" }, nonDurableEvent)).toBeUndefined();
    });

    it("returns undefined when event is null", () => {
      expect(extractDurableExecutionStatus({ Status: "SUCCEEDED" }, null)).toBeUndefined();
    });

    it("returns undefined when result is null", () => {
      expect(extractDurableExecutionStatus(null, durableEvent)).toBeUndefined();
    });

    it("returns undefined when result is a non-object (string)", () => {
      expect(extractDurableExecutionStatus("SUCCEEDED", durableEvent)).toBeUndefined();
    });

    it("does not apply status from non-durable invocations that happen to return Status field", () => {
      const nonDurableEvent = { httpMethod: "GET" };
      expect(extractDurableExecutionStatus({ Status: "SUCCEEDED" }, nonDurableEvent)).toBeUndefined();
    });
  });
});
