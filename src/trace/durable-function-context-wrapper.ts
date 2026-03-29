import { Span, Tracer } from "dd-trace";
import { logDebug } from "../utils";

// Types from AWS Durable Execution SDK
export interface DurableExecutionContext {
  step<T>(name: string, fn: () => Promise<T>, options?: StepOptions): Promise<T>;
  wait(name: string, duration: WaitDuration): Promise<void>;
  invoke<T>(name: string, functionName: string, payload?: any): Promise<T>;
  waitForCallback<T>(name: string, fn: (callbackId: string) => Promise<void>, options?: CallbackOptions): Promise<T>;
  parallel<T>(name: string, branches: (() => Promise<T>)[]): Promise<T[]>;
  map<T, R>(name: string, items: T[], fn: (item: T) => Promise<R>): Promise<R[]>;
  runInChildContext<T>(name: string, fn: (childCtx: DurableExecutionContext) => Promise<T>): Promise<T>;
}

export interface StepOptions {
  retryPolicy?: RetryPolicy;
}

export interface WaitDuration {
  seconds?: number;
  minutes?: number;
  hours?: number;
  days?: number;
}

export interface CallbackOptions {
  timeout?: WaitDuration;
}

export interface RetryPolicy {
  maxAttempts?: number;
  initialDelay?: WaitDuration;
  backoffRate?: number;
}

// Operation state from the durable execution event
export interface OperationState {
  Id: string;
  Type: string;
  SubType?: string;
  Name?: string;
  Status: "STARTED" | "SUCCEEDED" | "FAILED";
  StartTimestamp?: string;
  EndTimestamp?: string;
}

/**
 * Wraps a DurableExecutionContext to automatically create Datadog spans
 * for each operation (step, wait, invoke, etc.).
 *
 * Usage:
 * ```typescript
 * import { wrapDurableContext } from 'datadog-lambda-js';
 *
 * export const handler = datadog(
 *   withDurableExecution(async (event, ctx) => {
 *     const tracedCtx = wrapDurableContext(ctx, event);
 *     await tracedCtx.step('fetch-user', async () => fetchUser());
 *   })
 * );
 * ```
 */
export function wrapDurableContext(ctx: DurableExecutionContext, event: any): DurableExecutionContext {
  let tracer: Tracer;
  try {
    tracer = require("dd-trace");
  } catch {
    logDebug("dd-trace not available, returning unwrapped context");
    return ctx;
  }

  const operations = extractOperations(event);

  // Track which operations have been "consumed" to avoid double-matching
  const consumedOperationIds = new Set<string>();

  /**
   * Check if an operation is a replay (already completed in previous invocation).
   *
   * The SDK uses:
   * - `Id`: Auto-generated format like "step-1", "wait-1"
   * - `Name`: User-provided name like "fetch-user"
   * - `Type`: Operation type like "STEP", "WAIT", "INVOKE"
   *
   * We match by Name (user-provided) and Type since these are stable across replays.
   */
  const isReplay = (operationName: string, operationType: string): boolean => {
    // Find operation by name and type that hasn't been consumed yet
    const op = operations.find((o) => {
      if (consumedOperationIds.has(o.Id)) {
        return false;
      }
      // Match by name (what user provides) and type
      return o.Name === operationName && o.Type === operationType.toUpperCase();
    });

    if (op && (op.Status === "SUCCEEDED" || op.Status === "FAILED")) {
      // Mark this operation as consumed so it won't match again
      consumedOperationIds.add(op.Id);
      return true;
    }
    return false;
  };

  const createOperationSpan = (type: string, name: string, additionalTags?: Record<string, string>): Span | null => {
    try {
      const span = tracer.startSpan(`aws.lambda.durable.${type}`, {
        tags: {
          "durable.operation.type": type,
          "durable.operation.name": name,
          "resource.name": name,
          ...additionalTags,
        },
      });
      return span;
    } catch (error) {
      logDebug(`Failed to create span for ${type}:${name}`, { error });
      return null;
    }
  };

  const originalStep = ctx.step.bind(ctx);
  const wrappedStep = async <T>(name: string, fn: () => Promise<T>, options?: StepOptions): Promise<T> => {
    if (isReplay(name, "step")) {
      logDebug(`Replay detected for step: ${name}, skipping span`);
      return originalStep(name, fn, options);
    }

    const span = createOperationSpan("step", name);
    if (!span) {
      return originalStep(name, fn, options);
    }

    try {
      const result = await originalStep(name, fn, options);
      span.finish();
      return result;
    } catch (error) {
      span.setTag("error", true);
      if (error instanceof Error) {
        span.setTag("error.message", error.message);
        span.setTag("error.type", error.name);
      }
      span.finish();
      throw error;
    }
  };

  const originalWait = ctx.wait.bind(ctx);
  const wrappedWait = async (name: string, duration: WaitDuration): Promise<void> => {
    if (isReplay(name, "wait")) {
      logDebug(`Replay detected for wait: ${name}, skipping span`);
      return originalWait(name, duration);
    }

    const span = createOperationSpan("wait", name, {
      "durable.wait.duration": JSON.stringify(duration),
    });
    if (!span) {
      return originalWait(name, duration);
    }

    try {
      // Note: If this operation causes Lambda to exit (PENDING state), this span will not be
      // finished. This is expected - the span represents the operation attempt, not completion.
      // On replay, no span is created since the operation already completed (isReplay returns true).
      const result = await originalWait(name, duration);
      span.finish();
      return result;
    } catch (error) {
      span.setTag("error", true);
      span.finish();
      throw error;
    }
  };

  const originalInvoke = ctx.invoke.bind(ctx);
  const wrappedInvoke = async <T>(name: string, functionName: string, payload?: any): Promise<T> => {
    if (isReplay(name, "invoke")) {
      logDebug(`Replay detected for invoke: ${name}, skipping span`);
      return originalInvoke<T>(name, functionName, payload);
    }

    const span = createOperationSpan("invoke", name, {
      "durable.invoke.function_name": functionName,
    });
    if (!span) {
      return originalInvoke<T>(name, functionName, payload);
    }

    try {
      // Note: If this operation causes Lambda to exit (PENDING state), this span will not be
      // finished. This is expected - the span represents the operation attempt, not completion.
      // On replay, no span is created since the operation already completed (isReplay returns true).
      const result = await originalInvoke<T>(name, functionName, payload);
      span.finish();
      return result;
    } catch (error) {
      span.setTag("error", true);
      span.finish();
      throw error;
    }
  };

  const originalWaitForCallback = ctx.waitForCallback.bind(ctx);
  const wrappedWaitForCallback = async <T>(
    name: string,
    fn: (callbackId: string) => Promise<void>,
    options?: CallbackOptions,
  ): Promise<T> => {
    if (isReplay(name, "callback")) {
      logDebug(`Replay detected for waitForCallback: ${name}, skipping span`);
      return originalWaitForCallback<T>(name, fn, options);
    }

    const span = createOperationSpan("callback", name);
    if (!span) {
      return originalWaitForCallback<T>(name, fn, options);
    }

    try {
      // Note: If this operation causes Lambda to exit (PENDING state), this span will not be
      // finished. This is expected - the span represents the operation attempt, not completion.
      // On replay, no span is created since the operation already completed (isReplay returns true).
      const result = await originalWaitForCallback<T>(name, fn, options);
      span.finish();
      return result;
    } catch (error) {
      span.setTag("error", true);
      span.finish();
      throw error;
    }
  };

  const originalParallel = ctx.parallel.bind(ctx);
  const wrappedParallel = async <T>(name: string, branches: (() => Promise<T>)[]): Promise<T[]> => {
    if (isReplay(name, "parallel")) {
      logDebug(`Replay detected for parallel: ${name}, skipping span`);
      return originalParallel(name, branches);
    }

    const span = createOperationSpan("parallel", name, {
      "durable.parallel.branch_count": branches.length.toString(),
    });
    if (!span) {
      return originalParallel(name, branches);
    }

    try {
      const result = await originalParallel(name, branches);
      span.finish();
      return result;
    } catch (error) {
      span.setTag("error", true);
      span.finish();
      throw error;
    }
  };

  const originalMap = ctx.map.bind(ctx);
  const wrappedMap = async <T, R>(name: string, items: T[], fn: (item: T) => Promise<R>): Promise<R[]> => {
    if (isReplay(name, "map")) {
      logDebug(`Replay detected for map: ${name}, skipping span`);
      return originalMap(name, items, fn);
    }

    const span = createOperationSpan("map", name, {
      "durable.map.item_count": items.length.toString(),
    });
    if (!span) {
      return originalMap(name, items, fn);
    }

    try {
      const result = await originalMap(name, items, fn);
      span.finish();
      return result;
    } catch (error) {
      span.setTag("error", true);
      span.finish();
      throw error;
    }
  };

  const originalRunInChildContext = ctx.runInChildContext?.bind(ctx);
  const wrappedRunInChildContext = originalRunInChildContext
    ? async <T>(name: string, fn: (childCtx: DurableExecutionContext) => Promise<T>): Promise<T> => {
        if (isReplay(name, "child_context")) {
          logDebug(`Replay detected for runInChildContext: ${name}, skipping span`);
          return originalRunInChildContext(name, fn);
        }

        const span = createOperationSpan("child_context", name);
        if (!span) {
          return originalRunInChildContext(name, fn);
        }

        try {
          // Wrap the child context recursively
          const result = await originalRunInChildContext(name, (childCtx) => {
            const wrappedChildCtx = wrapDurableContext(childCtx, event);
            return fn(wrappedChildCtx);
          });
          span.finish();
          return result;
        } catch (error) {
          span.setTag("error", true);
          span.finish();
          throw error;
        }
      }
    : undefined;

  return {
    ...ctx,
    step: wrappedStep,
    wait: wrappedWait,
    invoke: wrappedInvoke,
    waitForCallback: wrappedWaitForCallback,
    parallel: wrappedParallel,
    map: wrappedMap,
    ...(wrappedRunInChildContext && { runInChildContext: wrappedRunInChildContext }),
  } as DurableExecutionContext;
}

/**
 * Extract operations array from the durable execution event.
 */
function extractOperations(event: any): OperationState[] {
  try {
    const operations = event?.InitialExecutionState?.Operations;
    if (Array.isArray(operations)) {
      return operations;
    }
    return [];
  } catch {
    return [];
  }
}
