import { logDebug } from "../utils";

export interface DurableFunctionContext {
  "aws_lambda.durable_function.execution_name": string;
  "aws_lambda.durable_function.execution_id": string;
}

export function extractDurableFunctionContext(event: any): DurableFunctionContext | undefined {
  const durableExecutionArn = event?.DurableExecutionArn;

  if (typeof durableExecutionArn !== "string") {
    return undefined;
  }

  const parsed = parseDurableExecutionArn(durableExecutionArn);
  if (!parsed) {
    logDebug("Failed to parse DurableExecutionArn", { arn: durableExecutionArn });
    return undefined;
  }

  return {
    "aws_lambda.durable_function.execution_name": parsed.executionName,
    "aws_lambda.durable_function.execution_id": parsed.executionId,
  };
}

/**
 * Parses a DurableExecutionArn to extract execution name and ID.
 * ARN format: arn:aws:lambda:{region}:{account}:function:{func}:{version}/durable-execution/{name}/{id}
 */
export function parseDurableExecutionArn(arn: string): { executionName: string; executionId: string } | undefined {
  // Match only the trailing durable execution segment.
  const match = arn.match(/\/durable-execution\/([^/]+)\/([^/]+)$/);
  if (!match) return undefined;
  const [, executionName, executionId] = match;
  return { executionName, executionId };
}

const VALID_EXECUTION_STATUSES = new Set(["SUCCEEDED", "FAILED", "STOPPED", "TIMED_OUT"]);

/**
 * Extracts the durable function execution status from the Lambda result.
 * Only applies when the event contains a DurableExecutionArn (i.e., this is a durable function invocation).
 * Returns undefined if the event is not a durable invocation or if the status is absent/unrecognized.
 */
export function extractDurableExecutionStatus(result: any, event: any): string | undefined {
  if (typeof event?.DurableExecutionArn !== "string") {
    return undefined;
  }
  if (result === null || typeof result !== "object") {
    return undefined;
  }
  const status = result.Status;
  if (typeof status === "string" && VALID_EXECUTION_STATUSES.has(status)) {
    return status;
  }
  return undefined;
}
