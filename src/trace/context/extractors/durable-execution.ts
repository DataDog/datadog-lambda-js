/**
 * Durable Execution Trace Extractor — Checkpoint/Upstream Approach
 *
 * Strategy:
 * 1. Prefer trace context from the latest `_datadog_{N}` checkpoint.
 * 2. If no trace checkpoint exists (first invocation), try upstream trace context
 *    from the original customer event stored in `Operations[0].ExecutionDetails.InputPayload`.
 * 3. If neither exists, start a new trace with random IDs.
 */

import { randomBytes } from "crypto";
import { logDebug } from "../../../utils";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { SampleMode, TraceSource } from "../../trace-context-service";
import { EventTraceExtractor } from "../extractor";

function parseTraceparentHex(
  traceparent: unknown,
): { traceIdHex: string; parentIdHex: string; lower64TraceIdDec: string; upper64TraceIdHex: string; parentIdDec: string } | null {
  if (typeof traceparent !== "string") return null;
  const parts = traceparent.split("-");
  if (parts.length !== 4) return null;
  const [, traceIdHex, parentIdHex] = parts;
  if (!/^[0-9a-f]{32}$/i.test(traceIdHex) || !/^[0-9a-f]{16}$/i.test(parentIdHex)) {
    return null;
  }

  const lower64TraceIdHex = traceIdHex.slice(16);
  const upper64TraceIdHex = traceIdHex.slice(0, 16);

  try {
    return {
      traceIdHex,
      parentIdHex,
      lower64TraceIdDec: BigInt(`0x${lower64TraceIdHex}`).toString(10),
      upper64TraceIdHex,
      parentIdDec: BigInt(`0x${parentIdHex}`).toString(10),
    };
  } catch {
    return null;
  }
}

function normalizeParentIdToDecimal(parentId: unknown): string | null {
  if (typeof parentId !== "string") return null;
  const value = parentId.trim();
  if (!value) return null;

  if (/^[0-9]+$/.test(value)) {
    return value;
  }

  if (/^[0-9a-f]+$/i.test(value)) {
    const hex = value.length > 16 ? value.slice(-16) : value;
    try {
      return BigInt(`0x${hex}`).toString(10);
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeTraceIdToDecimal(
  traceId: unknown,
): { traceId: string | null; ptidFromTraceId?: string } {
  if (typeof traceId !== "string") {
    return { traceId: null };
  }

  const value = traceId.trim();
  if (!value) {
    return { traceId: null };
  }

  if (/^[0-9]+$/.test(value)) {
    return { traceId: value };
  }

  if (/^[0-9a-f]+$/i.test(value)) {
    // If a 128-bit hex trace ID was accidentally put here, split it like traceparent:
    // lower 64 bits for Datadog trace_id, upper 64 bits for _dd.p.tid.
    if (value.length > 16) {
      const upperHex = value.slice(-32, -16).padStart(16, "0");
      const lowerHex = value.slice(-16);
      try {
        return {
          traceId: BigInt(`0x${lowerHex}`).toString(10),
          ptidFromTraceId: upperHex.toLowerCase(),
        };
      } catch {
        return { traceId: null };
      }
    }

    try {
      return {
        traceId: BigInt(`0x${value}`).toString(10),
      };
    } catch {
      return { traceId: null };
    }
  }

  return { traceId: null };
}

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

function generateRandomPositiveId(): string {
  const bytes = randomBytes(8);
  bytes[0] = bytes[0] & 0x7f; // keep it positive int64
  const value = bufferToBigInt(bytes);
  return value === 0n ? "1" : value.toString(10);
}

function generateRandomTraceId128(): { traceId: string; ptid: string } {
  const bytes = randomBytes(16);

  // Upper 64 bits -> _dd.p.tid
  const upperBytes = Buffer.from(bytes.subarray(0, 8));
  const upperValue = bufferToBigInt(upperBytes);
  const ptid = (upperValue === 0n ? 1n : upperValue).toString(16).padStart(16, "0");

  // Lower 64 bits -> Datadog trace_id (decimal)
  const lowerBytes = Buffer.from(bytes.subarray(8, 16));
  lowerBytes[0] = lowerBytes[0] & 0x7f; // keep positive int64
  const lowerValue = bufferToBigInt(lowerBytes);
  const traceId = lowerValue === 0n ? "1" : lowerValue.toString(10);

  return { traceId, ptid };
}

function bufferToBigInt(buf: Buffer): bigint {
  let result = 0n;
  for (let i = 0; i < buf.length; i++) {
    result = (result << 8n) | BigInt(buf[i]);
  }
  return result;
}

// Terminal operation statuses that indicate an operation has completed
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "STOPPED", "TIMED_OUT"]);

const TRACE_CHECKPOINT_NAME_PREFIX = "_datadog_";
const LEGACY_TRACE_CHECKPOINT_NAME_PREFIX = "_dd_trace_context_";
const TRACE_CHECKPOINT_NAME_PREFIXES = [
  TRACE_CHECKPOINT_NAME_PREFIX,
  LEGACY_TRACE_CHECKPOINT_NAME_PREFIX,
];

function parseTraceCheckpointNumber(name: unknown): number | null {
  if (typeof name !== "string") return null;

  const prefix = TRACE_CHECKPOINT_NAME_PREFIXES.find((candidate) => name.startsWith(candidate));
  if (!prefix) return null;

  const suffix = name.slice(prefix.length);
  const n = Number.parseInt(suffix, 10);
  if (Number.isNaN(n) || String(n) !== suffix) return null;
  return n;
}

function isTraceCheckpointName(name: unknown): boolean {
  return parseTraceCheckpointNumber(name) !== null;
}

/**
 * Find the highest-numbered `_datadog_{N}` checkpoint in the event.
 * Also supports legacy `_dd_trace_context_{N}` checkpoints for compatibility.
 * Each invocation that changes trace context saves a new checkpoint with
 * N+1; the one with the highest N is the most recent.
 */
function findLatestTraceContextCheckpoint(
  event: DurableExecutionEvent,
): { number: number; name: string; headers: Record<string, string> } | null {
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
      return {
        number: best.number,
        name: String(best.op.Name),
        headers: parsed as Record<string, string>,
      };
    }
  } catch (e) {
    logDebug(`Failed to parse trace checkpoint payload: ${e}`);
  }
  return null;
}

/**
 * Try to extract a real Datadog trace context from the original customer event
 * stored inside the durable execution envelope.
 *
 * The original event is stored in Operations[0].ExecutionDetails.InputPayload.
 * Since all invocations replay the same stored event, any trace headers injected
 * by an upstream Datadog-traced service will be present on every invocation.
 *
 * Returns extracted context info or null.
 */
function extractUpstreamTraceContext(
  event: DurableExecutionEvent,
): { traceId: string; parentId: string; samplingPriority: string; ptid: string } | null {
  try {
    const operations = event.InitialExecutionState?.Operations;
    if (!operations || operations.length === 0) return null;

    const firstOp = operations[0];
    const inputPayloadStr = firstOp.ExecutionDetails?.InputPayload;
    if (!inputPayloadStr) return null;

    const customerEvent = JSON.parse(inputPayloadStr);
    if (!customerEvent || typeof customerEvent !== "object") return null;

    // Try headers (API Gateway, ALB, Function URL)
    const headers = customerEvent.headers;
    if (headers && typeof headers === "object") {
      const traceId = headers["x-datadog-trace-id"];
      const parentId = headers["x-datadog-parent-id"];
      if (traceId && parentId) {
        const samplingPriority = headers["x-datadog-sampling-priority"] || "1";
        const tags = headers["x-datadog-tags"] || "";
        const ptid = parsePtid(tags);
        logDebug(`Found upstream trace context in customer event headers`);
        return { traceId, parentId, samplingPriority, ptid };
      }
    }

    // Try _datadog field (direct invocation / Step Functions)
    const ddData = customerEvent._datadog;
    if (ddData && typeof ddData === "object") {
      const traceId = ddData["x-datadog-trace-id"];
      const parentId = ddData["x-datadog-parent-id"];
      if (traceId && parentId) {
        const samplingPriority = ddData["x-datadog-sampling-priority"] || "1";
        const tags = ddData["x-datadog-tags"] || "";
        const ptid = parsePtid(tags);
        logDebug(`Found upstream trace context in customer event _datadog field`);
        return { traceId, parentId, samplingPriority, ptid };
      }
    }
  } catch (e) {
    logDebug(`Failed to extract upstream trace context from durable event: ${e}`);
  }

  return null;
}

/**
 * Parse _dd.p.tid from x-datadog-tags string.
 * Format: "_dd.p.tid=66bcb5eb00000000,_dd.p.dm=-0"
 */
function parsePtid(tags: string): string {
  if (!tags) return "";
  for (const tag of tags.split(",")) {
    if (tag.includes("_dd.p.tid=")) {
      return tag.split("=")[1] || "";
    }
  }
  return "";
}

/**
 * Durable Execution Trace Extractor
 *
 * Strategy:
 * 1. Prefer `_datadog_{N}` checkpoint context when present.
 * 2. Otherwise, derive trace linkage from upstream customer event context.
 * 3. If none exists, start a new random trace context.
 */
export class DurableExecutionEventTraceExtractor implements EventTraceExtractor {
  extract(event: unknown): SpanContextWrapper | null {
    if (!isDurableExecutionEvent(event)) {
      logDebug("Event is not a durable execution event");
      return null;
    }

    const executionArn = event.DurableExecutionArn;
    if (!executionArn) {
      logDebug("No DurableExecutionArn in event");
      return null;
    }

    // --- Step 0: Prefer a previously-saved trace-context checkpoint ---
    // If a previous invocation saved a `_datadog_{N}` checkpoint, use
    // the one with the highest N — it reflects the latest trace-context state
    // of the ongoing durable execution.  Same scheme as dd-trace-py.
    const latestCheckpoint = findLatestTraceContextCheckpoint(event);
    if (latestCheckpoint) {
      logDebug(
        `Using trace context from checkpoint ${latestCheckpoint.name}`,
      );
      const traceIdStr = latestCheckpoint.headers["x-datadog-trace-id"];
      const parentIdStr = latestCheckpoint.headers["x-datadog-parent-id"];
      const samplingPriorityStr = latestCheckpoint.headers["x-datadog-sampling-priority"] || "1";
      const tagsStr = latestCheckpoint.headers["x-datadog-tags"] || "";
      let ptidFromTags = parsePtid(tagsStr);
      let effectiveTraceId = traceIdStr;
      let effectiveParentId = parentIdStr;

      if ((!effectiveTraceId || !effectiveParentId) && latestCheckpoint.headers.traceparent) {
        const parsedTraceparent = parseTraceparentHex(latestCheckpoint.headers.traceparent);
        if (parsedTraceparent) {
          effectiveTraceId = effectiveTraceId || parsedTraceparent.lower64TraceIdDec;
          effectiveParentId = effectiveParentId || parsedTraceparent.parentIdDec;
          ptidFromTags = ptidFromTags || parsedTraceparent.upper64TraceIdHex;
        }
      }

      const normalizedTraceId = normalizeTraceIdToDecimal(effectiveTraceId);
      const normalizedParentId = normalizeParentIdToDecimal(effectiveParentId);
      if (!ptidFromTags && normalizedTraceId.ptidFromTraceId) {
        ptidFromTags = normalizedTraceId.ptidFromTraceId;
      }

      if (normalizedTraceId.traceId && normalizedParentId) {
        try {
          const _DatadogSpanContext = require("dd-trace/packages/dd-trace/src/opentracing/span_context");
          const id = require("dd-trace/packages/dd-trace/src/id");

          const ddSpanContext = new _DatadogSpanContext({
            traceId: id(normalizedTraceId.traceId, 10),
            spanId: id(normalizedParentId, 10),
            sampling: { priority: samplingPriorityStr },
          });

          if (ptidFromTags) {
            ddSpanContext._trace.tags["_dd.p.tid"] = ptidFromTags;
          }
          return new SpanContextWrapper(ddSpanContext, TraceSource.Event);
        } catch (e) {
          logDebug(`Failed to construct SpanContext from checkpoint: ${e}`);
          const fallback = SpanContextWrapper.fromTraceContext({
            traceId: normalizedTraceId.traceId,
            parentId: normalizedParentId,
            sampleMode: parseInt(samplingPriorityStr, 10),
            source: TraceSource.Event,
          });
          if (fallback) {
            return fallback;
          }
        }
      }
    }

    // --- Step 1: Try to use real upstream trace context ---
    const upstream = extractUpstreamTraceContext(event);

    let traceId: string;
    let ptid: string;
    const rootSpanId = generateRandomPositiveId();
    let samplingPriority: string;

    if (upstream) {
      const normalizedUpstreamTrace = normalizeTraceIdToDecimal(upstream.traceId);
      const normalizedTraceId = normalizedUpstreamTrace.traceId;

      if (normalizedTraceId) {
        traceId = normalizedTraceId;
        ptid = upstream.ptid || normalizedUpstreamTrace.ptidFromTraceId || "";
        samplingPriority = upstream.samplingPriority;
        logDebug(`Using upstream trace_id=${traceId}, _dd.p.tid=${ptid}`);
      } else {
        const randomTrace = generateRandomTraceId128();
        traceId = randomTrace.traceId;
        ptid = randomTrace.ptid;
        samplingPriority = SampleMode.AUTO_KEEP.toString();
        logDebug(`Upstream trace_id invalid, generated new trace_id=${traceId}, _dd.p.tid=${ptid}`);
      }

    } else {
      // --- Step 2: No checkpoint and no upstream context ---
      // Start a new trace and create a random durable root span id that
      // checkpoints will carry across subsequent invocations.
      const randomTrace = generateRandomTraceId128();
      traceId = randomTrace.traceId;
      ptid = randomTrace.ptid;
      samplingPriority = SampleMode.AUTO_KEEP.toString();

      logDebug(`No upstream context, generated trace_id=${traceId}, root_span_id=${rootSpanId}, _dd.p.tid=${ptid}`);
    }

    logDebug(`Generated initial durable root context: trace_id=${traceId}, root_span_id=${rootSpanId}, _dd.p.tid=${ptid}`);

    // Construct span context with _dd.p.tid for 128-bit W3C trace ID support
    // Similar to Step Functions' approach in step-function-service.ts
    try {
      const _DatadogSpanContext = require("dd-trace/packages/dd-trace/src/opentracing/span_context");
      const id = require("dd-trace/packages/dd-trace/src/id");

      const ddSpanContext = new _DatadogSpanContext({
        traceId: id(traceId, 10),
        spanId: id(rootSpanId, 10),
        sampling: { priority: samplingPriority },
      });

      // Set _dd.p.tid for upper 64 bits of 128-bit trace ID
      if (ptid) {
        ddSpanContext._trace.tags["_dd.p.tid"] = ptid;
      }

      return new SpanContextWrapper(ddSpanContext, TraceSource.Event);
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Couldn't generate SpanContext with tracer, falling back.", error);
      }
    }

    // Fallback without _dd.p.tid if dd-trace is not available
    return SpanContextWrapper.fromTraceContext({
      traceId,
      parentId: rootSpanId,
      sampleMode: parseInt(samplingPriority, 10),
      source: TraceSource.Event,
    });
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

  return operations.filter((op) =>
    op.Status === "SUCCEEDED" || op.Status === "FAILED"
  ).length;
}

/**
 * Create the durable execution root span for likely first invocations only.
 *
 * Replay invocations return null. The current first-invocation heuristic is:
 * - no trace checkpoint operation exists
 * - no operation has terminal status
 * - operation count is <= 1
 *
 * Returns an object with { span, finish() } or null if not a durable execution.
 * Caller must call finish() when the invocation ends.
 */
export function createDurableExecutionRootSpan(
  event: unknown,
  extractedRootContext?: SpanContextWrapper | null,
): { span: any; finish: () => void } | null {
  if (!isDurableExecutionEvent(event)) {
    return null;
  }

  const executionArn = event.DurableExecutionArn;
  if (!executionArn) {
    return null;
  }

  const operations = event.InitialExecutionState?.Operations;
  const hasCheckpoint = Boolean(
    operations?.some((op) => isTraceCheckpointName(op?.Name)),
  );
  const hasCompletedOperation = Boolean(operations?.some((op) => TERMINAL_STATUSES.has(op.Status)));
  const isLikelyFirstInvocation = !hasCheckpoint && !hasCompletedOperation && (operations?.length ?? 0) <= 1;

  if (!isLikelyFirstInvocation) {
    return null;
  }

  const rootSpanId = extractedRootContext?.toSpanId() || generateRandomPositiveId();

  // Determine consistent start_time from the first operation's StartTimestamp
  // StartTimestamp is unix milliseconds from the durable execution SDK
  let startTime: number | undefined;
  const replayOperations = event.InitialExecutionState?.Operations;
  if (replayOperations && replayOperations.length > 0) {
    const firstStartTs = replayOperations[0].StartTimestamp;
    if (firstStartTs != null) {
      const parsed = Number(firstStartTs);
      if (!isNaN(parsed)) {
        startTime = parsed;  // already in millis, dd-trace startSpan expects millis
      }
    }
  }

  try {
    const tracer = require("dd-trace");
    const id = require("dd-trace/packages/dd-trace/src/id");

    const serviceName = process.env.DD_DURABLE_EXECUTION_SERVICE || "aws.durable-execution";
    const resourceName = executionArn.includes(":") ? executionArn.split(":").pop() : executionArn;

    const spanOptions: Record<string, any> = {
      type: "serverless",
      tags: {
        "service.name": serviceName,
        "resource.name": resourceName,
        "durable.execution_arn": executionArn,
        "durable.is_root_span": true,
        "durable.invocation_count": replayOperations?.length ?? 0,
      },
    };

    if (startTime !== undefined) {
      spanOptions.startTime = startTime;
    }
    if (extractedRootContext?.spanContext) {
      // Ensure the durable root span stays in the same trace as the extracted
      // durable invocation context even when there is no active scope.
      spanOptions.childOf = extractedRootContext.spanContext;
    }

    const span = tracer.startSpan("aws.durable-execution", spanOptions);

    // Use the extracted durable root span_id when available to keep the
    // durable root identity stable with propagated checkpoint context.
    try {
      if (rootSpanId) {
        span.context()._spanId = id(rootSpanId, 10);
      }
    } catch (e) {
      logDebug(`Failed to set durable root span_id: ${e}`);
    }

    // Fix parent_id: the active context has span_id=root_span_id (set by
    // DurableExecutionEventTraceExtractor.extract), so tracer.startSpan()
    // inherits that as parent_id, causing self-parenting. The root span's
    // parent should be the upstream caller (if extracted) or 0 (true root).
    try {
      const upstream = extractUpstreamTraceContext(event as DurableExecutionEvent);
      if (upstream) {
        span.context()._parentId = id(upstream.parentId, 10);
      } else {
        span.context()._parentId = id("0", 10);
      }
    } catch (e) {
      logDebug(`Failed to set root span parent_id: ${e}`);
    }

    logDebug(`Created root execution span: span_id=${rootSpanId ?? "auto"}, start_time=${startTime}`);

    return {
      span,
      finish: () => {
        span.finish();
        logDebug("Finished root execution span");
      },
    };
  } catch (e) {
    logDebug(`Failed to create durable execution root span: ${e}`);
    return null;
  }
}
