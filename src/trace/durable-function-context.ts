import { logDebug } from "../utils";

export interface DurableFunctionContext {
  durable_function_execution_name: string;
  durable_function_execution_id: string;
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
    durable_function_execution_name: parsed.executionName,
    durable_function_execution_id: parsed.executionId,
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
