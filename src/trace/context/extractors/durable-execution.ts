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
 * Therefore all `aws.lambda` spans will be anchored to the first 
 * `aws.durable.execute` span for a durable execution.
 *
 * Checkpoint data will be written by the dd-trace-js plugin in Datadog style
 * (`x-datadog-*`). Extraction goes through the standard `TracerWrapper.extract`
 * path, which honors `DD_TRACE_PROPAGATION_STYLE_EXTRACT`. The default extract
 * list (`datadog, tracecontext, baggage`) already includes `datadog`. Customers
 *  who override the extract list MUST keep `datadog` in it.
 */

import { logDebug } from "../../../utils";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { TracerWrapper } from "../../tracer-wrapper";
import { EventTraceExtractor } from "../extractor";

const TRACE_CHECKPOINT_NAME_PREFIX = "_datadog_";

interface CheckpointOperation {
  Name?: string;
  Payload?: string;
  StepDetails?: { Result?: string };
}

interface DurableExecutionEventShape {
  DurableExecutionArn?: string;
  InitialExecutionState?: { Operations?: CheckpointOperation[] };
}

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
function findLatestCheckpointHeaders(event: DurableExecutionEventShape): Record<string, string> | null {
  const operations = event.InitialExecutionState?.Operations;
  if (!operations || operations.length === 0) return null;

  let best: { number: number; op: CheckpointOperation } | null = null;
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
    const e = event as DurableExecutionEventShape | undefined;
    if (!e?.DurableExecutionArn) {
      logDebug("No DurableExecutionArn in event");
      return null;
    }

    const checkpointHeaders = findLatestCheckpointHeaders(e);
    if (checkpointHeaders) {
      logDebug("Extracting trace context from durable checkpoint");
      return this.tracerWrapper.extract(checkpointHeaders);
    }

    logDebug("No durable trace context found; deferring to default extraction");
    return null;
  }
}


