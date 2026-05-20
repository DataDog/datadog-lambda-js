/**
 * Durable Execution Trace Extractor — Checkpoint Approach
 *
 * Strategy:
 * 1. Look for trace context in the latest `_datadog_{N}` checkpoint.
 * 2. If no trace checkpoint exists, return null and let the default extraction
 *    path create the context.
 *
 * The extracted context becomes the parent of the `aws.lambda` span (and any
 * downstream spans created by dd-trace-js, including `aws.durable.execute`).
 * This integration no longer creates a separate root span — anchoring to the
 * first `aws.durable.execute` span in dd-trace-js is the canonical entry point
 * for a durable execution.
 *
 * The dd-trace-js plugin writes checkpoint headers in **Datadog style only**
 * (regardless of `DD_TRACE_PROPAGATION_STYLE_INJECT`), so we extract them with
 * a matching forced-datadog propagator via `TracerWrapper.extractDatadogOnly`.
 */

import { logDebug } from "../../../utils";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { TracerWrapper } from "../../tracer-wrapper";
import { EventTraceExtractor } from "../extractor";

/**
 * Interface for operation data in durable execution state
 */
export interface DurableExecutionOperation {
  Id: string;
  Status: string;
  Type?: string;
  Name?: string;
  ExecutionDetails?: {
    InputPayload?: string;
  };
  StepDetails?: {
    Result?: string;
    Error?: unknown;
    NextAttemptTimestamp?: string;
  };
  Payload?: string;
  CallbackDetails?: {
    Result?: string;
    CallbackId?: string;
    Error?: unknown;
  };
  StartedAt?: string;
  StartTimestamp?: number;
  CompletedAt?: string;
}

/**
 * Interface for initial execution state in durable execution events
 */
export interface InitialExecutionState {
  Operations?: DurableExecutionOperation[];
  Status?: string;
}

/**
 * Interface for durable execution event
 */
export interface DurableExecutionEvent {
  DurableExecutionArn?: string;
  CheckpointToken?: string;
  InitialExecutionState?: InitialExecutionState;
  Input?: unknown;
}


/**
 * Get checkpoint token from event
 */
export function getCheckpointToken(event: unknown): string | undefined {
  const e = event as DurableExecutionEvent | undefined;
  if (!e?.DurableExecutionArn) {
    return undefined;
  }
  return e.CheckpointToken;
}

// Terminal operation statuses that indicate an operation has completed
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "STOPPED", "TIMED_OUT"]);

const TRACE_CHECKPOINT_NAME_PREFIX = "_datadog_";

function parseTraceCheckpointNumber(name: unknown): number | null {
  if (typeof name !== "string") return null;

  if (!name.startsWith(TRACE_CHECKPOINT_NAME_PREFIX)) return null;
  const suffix = name.slice(TRACE_CHECKPOINT_NAME_PREFIX.length);
  const n = Number.parseInt(suffix, 10);
  if (Number.isNaN(n) || String(n) !== suffix) return null;
  return n;
}

/**
 * Find the highest-numbered `_datadog_{N}` checkpoint in the event and return
 * its parsed header dict.
 *
 * Each invocation that changes trace context saves a new checkpoint with N+1;
 * the one with the highest N is the most recent. Headers are written by the
 * dd-trace-js plugin via `tracer.inject(span, 'http_headers', headers)` so the
 * payload is a standard HTTP-style header dict.
 *
 */
function findLatestCheckpointHeaders(event: DurableExecutionEvent): Record<string, string> | null {
  const operations = event.InitialExecutionState?.Operations;
  if (!operations || operations.length === 0) return null;

  let best: { number: number; op: DurableExecutionOperation } | null = null;
  for (const op of operations) {
    const n = parseTraceCheckpointNumber(op?.Name);
    if (n === null) continue;
    if (best === null || n > best.number) {
      best = { number: n, op };
    }
  }
  if (best === null) return null;

  const raw = best.op.Payload ?? best.op.StepDetails?.Result;
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string>;
    }
  } catch (e) {
    logDebug(`Failed to parse trace checkpoint payload: ${e}`);
  }
  return null;
}


export class DurableExecutionEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: unknown): SpanContextWrapper | null {
    const e = event as DurableExecutionEvent | undefined;
    if (!e?.DurableExecutionArn) {
      logDebug("No DurableExecutionArn in event");
      return null;
    }

    const checkpointHeaders = findLatestCheckpointHeaders(e);
    if (checkpointHeaders) {
      logDebug("Extracting trace context from durable checkpoint (datadog-only)");
      return this.tracerWrapper.extractDatadogOnly(checkpointHeaders);
    }

    logDebug("No durable trace context found; deferring to default extraction");
    return null;
  }
}

/**
 * Utility to check if a durable operation is a replay
 *
 * An operation is a replay if it exists in the initial execution state
 * with a terminal status (SUCCEEDED, FAILED, CANCELLED, STOPPED, TIMED_OUT)
 *
 * @param event - Lambda event
 * @param stepId - The step ID to check (may be hashed)
 * @returns true if the operation is a replay
 */
export function isOperationReplay(event: unknown, stepId: string): boolean {
  const e = event as DurableExecutionEvent | undefined;
  if (!e?.DurableExecutionArn) {
    return false;
  }

  const operations = e.InitialExecutionState?.Operations;
  if (!operations || operations.length === 0) {
    return false;
  }

  const operation = operations.find((op) => op.Id === stepId);
  if (!operation) {
    return false;
  }

  return TERMINAL_STATUSES.has(operation.Status);
}

/**
 * Get the replay status of an operation
 *
 * @param event - Lambda event
 * @param stepId - The step ID to check
 * @returns Operation status if found, undefined otherwise
 */
export function getOperationStatus(event: unknown, stepId: string): string | undefined {
  const e = event as DurableExecutionEvent | undefined;
  if (!e?.DurableExecutionArn) {
    return undefined;
  }

  const operations = e.InitialExecutionState?.Operations;
  if (!operations) {
    return undefined;
  }

  const operation = operations.find((op) => op.Id === stepId);
  return operation?.Status;
}

/**
 * Count the number of completed operations in the event
 *
 * @param event - Lambda event
 * @returns Number of completed operations
 */
export function getCompletedOperationCount(event: unknown): number {
  const e = event as DurableExecutionEvent | undefined;
  if (!e?.DurableExecutionArn) {
    return 0;
  }

  const operations = e.InitialExecutionState?.Operations;
  if (!operations) {
    return 0;
  }

  return operations.filter((op) => op.Status === "SUCCEEDED" || op.Status === "FAILED").length;
}

