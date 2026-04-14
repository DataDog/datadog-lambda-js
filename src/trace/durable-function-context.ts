import { logDebug } from "../utils";

export interface DurableFunctionContext {
  "aws_lambda.durable_function.execution_name": string;
  "aws_lambda.durable_function.execution_id": string;
  "aws_lambda.durable_function.first_invocation"?: string;
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

  const context: DurableFunctionContext = {
    "aws_lambda.durable_function.execution_name": parsed.executionName,
    "aws_lambda.durable_function.execution_id": parsed.executionId,
  };

  // Use the number of operations to determine if it's the first invocation.
  const operations = event?.InitialExecutionState?.Operations;
  if (Array.isArray(operations)) {
    context["aws_lambda.durable_function.first_invocation"] = String(operations.length === 1);
  }

  return context;
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
