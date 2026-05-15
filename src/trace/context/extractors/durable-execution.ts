/**
 * Durable Execution Trace Extractor — Checkpoint/Upstream Approach
 *
 * Strategy:
 * 1. Prefer trace context from the latest `_datadog_{N}` checkpoint.
 * 2. If no trace checkpoint exists (first invocation), try upstream trace context
 *    from the original customer event stored in `Operations[0].ExecutionDetails.InputPayload`.
 * 3. If neither exists, return null and let the default extraction path create the context.
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
 * Upstream customer-event headers come from arbitrary services and continue to
 * be extracted with the user-configured style via `TracerWrapper.extract`.
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
 * Check if event is a durable execution event
 */
export function isDurableExecutionEvent(event: unknown): event is DurableExecutionEvent {
  if (!event || typeof event !== "object") {
    return false;
  }

  const maybeEvent = event as Record<string, unknown>;
  return Boolean(maybeEvent.DurableExecutionArn && maybeEvent.CheckpointToken);
}

/**
 * Check if this is a replay invocation (has previous operations)
 */
export function isDurableExecutionReplay(event: unknown): boolean {
  if (!isDurableExecutionEvent(event)) {
    return false;
  }

  const operations = event.InitialExecutionState?.Operations;
  return Array.isArray(operations) && operations.length > 0;
}

/**
 * Get durable execution ARN from event
 */
export function getDurableExecutionArn(event: unknown): string | undefined {
  if (!isDurableExecutionEvent(event)) {
    return undefined;
  }
  return event.DurableExecutionArn;
}

/**
 * Get checkpoint token from event
 */
export function getCheckpointToken(event: unknown): string | undefined {
  if (!isDurableExecutionEvent(event)) {
    return undefined;
  }
  return event.CheckpointToken;
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

/**
 * Find upstream HTTP headers carried by the original customer event stored in
 * `Operations[0].ExecutionDetails.InputPayload`. Returns the standard header
 * dict (keys like `x-datadog-trace-id`, `traceparent`, etc.) or null.
 */
function findUpstreamHeaders(event: DurableExecutionEvent): Record<string, string> | null {
  try {
    const operations = event.InitialExecutionState?.Operations;
    if (!operations || operations.length === 0) return null;

    const inputPayloadStr = operations[0].ExecutionDetails?.InputPayload;
    if (!inputPayloadStr) return null;

    const customerEvent = JSON.parse(inputPayloadStr);
    if (!customerEvent || typeof customerEvent !== "object") return null;

    const headers = customerEvent.headers;
    if (headers && typeof headers === "object") {
      return headers as Record<string, string>;
    }

    const ddData = customerEvent._datadog;
    if (ddData && typeof ddData === "object") {
      return ddData as Record<string, string>;
    }
  } catch (e) {
    logDebug(`Failed to read upstream headers from durable input payload: ${e}`);
  }

  return null;
}

/**
 * Durable Execution Trace Extractor
 *
 * Locates trace headers carried inside the durable execution envelope and hands
 * them to the standard dd-trace propagator via `TracerWrapper.extract`. Order:
 * 1. Latest `_datadog_{N}` checkpoint payload.
 * 2. Upstream customer event headers from `InputPayload`.
 * 3. Otherwise return null and let the default extraction path take over.
 */
export class DurableExecutionEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: unknown): SpanContextWrapper | null {
    if (!isDurableExecutionEvent(event)) {
      logDebug("Event is not a durable execution event");
      return null;
    }
    if (!event.DurableExecutionArn) {
      logDebug("No DurableExecutionArn in event");
      return null;
    }

    const checkpointHeaders = findLatestCheckpointHeaders(event);
    if (checkpointHeaders) {
      logDebug("Extracting trace context from durable checkpoint (datadog-only)");
      return this.tracerWrapper.extractDatadogOnly(checkpointHeaders);
    }

    const upstreamHeaders = findUpstreamHeaders(event);
    if (upstreamHeaders) {
      logDebug("Extracting trace context from upstream durable input payload");
      return this.tracerWrapper.extract(upstreamHeaders);
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
  if (!isDurableExecutionEvent(event)) {
    return false;
  }

  const operations = event.InitialExecutionState?.Operations;
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
  if (!isDurableExecutionEvent(event)) {
    return undefined;
  }

  const operations = event.InitialExecutionState?.Operations;
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
  if (!isDurableExecutionEvent(event)) {
    return 0;
  }

  const operations = event.InitialExecutionState?.Operations;
  if (!operations) {
    return 0;
  }

  return operations.filter((op) => op.Status === "SUCCEEDED" || op.Status === "FAILED").length;
}

