import { logDebug } from "../utils";
import { SampleMode, TraceSource } from "./trace-context-service";
import { SpanContextWrapper } from "./span-context-wrapper";
import { Sha256 } from "@aws-crypto/sha256-js";
import { extractDurableFunctionContext, DurableFunctionContext } from "./durable-function-context";

// Types for preserved event trace context
interface PreservedTraceContext {
  traceId: string;
  parentId: string;
  samplingPriority?: string;
  source: "http" | "sns" | "sqs" | "eventbridge" | "custom";
}

export const TRACE_ID = "traceId";
export const PARENT_ID = "spanId";
export const DD_P_TID = "_dd.p.tid";

export class DurableFunctionContextService {
  private static _instance: DurableFunctionContextService;
  public context?: DurableFunctionContext;
  private preservedEvent?: any;
  private preservedTraceContext?: PreservedTraceContext | null;

  private constructor(event: any) {
    this.context = extractDurableFunctionContext(event);
    this.preservedEvent = this.extractPreservedEvent(event);
    this.preservedTraceContext = undefined; // Lazy evaluated
  }

  public static instance(event?: any): DurableFunctionContextService {
    return this._instance || (this._instance = new this(event));
  }

  public static reset(): void {
    this._instance = undefined as any;
  }

  /**
   * Extract the original customer event from InitialExecutionState.
   * This event is preserved across all replays and may contain trace context.
   */
  private extractPreservedEvent(event: any): any | undefined {
    try {
      const operations = event?.InitialExecutionState?.Operations;
      if (!Array.isArray(operations) || operations.length === 0) {
        return undefined;
      }

      // First operation contains the execution details with InputPayload
      const firstOperation = operations[0];
      const inputPayload = firstOperation?.ExecutionDetails?.InputPayload;

      if (typeof inputPayload === "string") {
        return JSON.parse(inputPayload);
      }
      return undefined;
    } catch (error) {
      logDebug("Failed to parse preserved event from InputPayload", { error });
      return undefined;
    }
  }

  /**
   * Try to extract trace context from the preserved original event.
   * Checks HTTP headers, SNS attributes, SQS attributes, etc.
   */
  private extractTraceFromPreservedEvent(): PreservedTraceContext | null {
    if (!this.preservedEvent) return null;

    // Check for HTTP headers (API Gateway, ALB, Function URL)
    const headers = this.preservedEvent.headers ?? this.preservedEvent.multiValueHeaders;
    if (headers && typeof headers === "object") {
      const traceId = this.getHeader(headers, "x-datadog-trace-id");
      const parentId = this.getHeader(headers, "x-datadog-parent-id");
      const samplingPriority = this.getHeader(headers, "x-datadog-sampling-priority");

      if (traceId && parentId) {
        logDebug("Found trace context in preserved HTTP headers", { traceId, parentId });
        return { traceId, parentId, samplingPriority, source: "http" };
      }
    }

    // Check for _datadog object (common injection point)
    if (this.preservedEvent._datadog) {
      const dd = this.preservedEvent._datadog;
      if (dd["x-datadog-trace-id"] && dd["x-datadog-parent-id"]) {
        logDebug("Found trace context in preserved _datadog object", dd);
        return {
          traceId: dd["x-datadog-trace-id"],
          parentId: dd["x-datadog-parent-id"],
          samplingPriority: dd["x-datadog-sampling-priority"],
          source: "custom",
        };
      }
    }

    // Check SNS Records
    if (this.preservedEvent.Records?.[0]?.Sns?.MessageAttributes) {
      const attrs = this.preservedEvent.Records[0].Sns.MessageAttributes;
      const traceId = attrs["_datadog.trace-id"]?.Value ?? attrs["x-datadog-trace-id"]?.Value;
      const parentId = attrs["_datadog.parent-id"]?.Value ?? attrs["x-datadog-parent-id"]?.Value;

      if (traceId && parentId) {
        logDebug("Found trace context in preserved SNS attributes", { traceId, parentId });
        return { traceId, parentId, source: "sns" };
      }
    }

    // Check SQS Records
    if (this.preservedEvent.Records?.[0]?.messageAttributes) {
      const attrs = this.preservedEvent.Records[0].messageAttributes;
      // tslint:disable-next-line:no-string-literal
      const datadogTraceId = attrs._datadog_trace_id ?? attrs["x-datadog-trace-id"];
      // tslint:disable-next-line:no-string-literal
      const datadogParentId = attrs._datadog_parent_id ?? attrs["x-datadog-parent-id"];
      const traceId = datadogTraceId?.stringValue;
      const parentId = datadogParentId?.stringValue;

      if (traceId && parentId) {
        logDebug("Found trace context in preserved SQS attributes", { traceId, parentId });
        return { traceId, parentId, source: "sqs" };
      }
    }

    // Check EventBridge detail
    if (this.preservedEvent.detail?._datadog) {
      const dd = this.preservedEvent.detail._datadog;
      if (dd["x-datadog-trace-id"] && dd["x-datadog-parent-id"]) {
        logDebug("Found trace context in preserved EventBridge detail", dd);
        return {
          traceId: dd["x-datadog-trace-id"],
          parentId: dd["x-datadog-parent-id"],
          samplingPriority: dd["x-datadog-sampling-priority"],
          source: "eventbridge",
        };
      }
    }

    return null;
  }

  private getHeader(headers: any, key: string): string | undefined {
    // Handle both single-value and multi-value headers (case-insensitive)
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === lowerKey) {
        return Array.isArray(v) ? v[0] : (v as string);
      }
    }
    return undefined;
  }

  public get spanContext(): SpanContextWrapper | null {
    if (!this.context) return null;

    // Lazy evaluate preserved trace context
    if (this.preservedTraceContext === undefined) {
      this.preservedTraceContext = this.extractTraceFromPreservedEvent();
    }

    let traceId: string;
    let parentId: string;
    let ptid: string;
    let usePreservedContext = false;

    if (this.preservedTraceContext) {
      // Use trace context from preserved original event
      traceId = this.preservedTraceContext.traceId;
      parentId = this.preservedTraceContext.parentId;
      ptid = ""; // Will be extracted from trace tags if available
      usePreservedContext = true;
      logDebug("Using trace context from preserved event", { traceId, parentId });
    } else {
      // Fall back to deterministic trace ID from execution ID
      traceId = this.deterministicSha256HashToBigIntString(this.context.durable_function_execution_id, TRACE_ID);
      ptid = this.deterministicSha256HashToBigIntString(this.context.durable_function_execution_id, DD_P_TID);
      // Parent ID includes execution name for uniqueness
      parentId = this.deterministicSha256HashToBigIntString(
        `${this.context.durable_function_execution_id}#${this.context.durable_function_execution_name}`,
        PARENT_ID,
      );
      logDebug("Using deterministic trace ID from execution ID", { traceId, parentId });
    }

    // Use sampling priority from preserved event if available, otherwise default to AUTO_KEEP
    let sampleMode = SampleMode.AUTO_KEEP;
    if (this.preservedTraceContext?.samplingPriority) {
      const priority = parseInt(this.preservedTraceContext.samplingPriority, 10);
      if (!isNaN(priority)) {
        sampleMode = priority;
      }
    }

    try {
      const _DatadogSpanContext = require("dd-trace/packages/dd-trace/src/opentracing/span_context");
      const id = require("dd-trace/packages/dd-trace/src/id");

      const ddSpanContext = new _DatadogSpanContext({
        traceId: id(traceId, 10),
        spanId: id(parentId, 10),
        sampling: { priority: sampleMode },
      });

      if (ptid) {
        ddSpanContext._trace.tags["_dd.p.tid"] = id(ptid, 10).toString(16);
      }

      logDebug("Created SpanContext for DurableFunction", {
        traceContext: ddSpanContext,
        source: usePreservedContext ? "preserved_event" : "deterministic",
      });

      return new SpanContextWrapper(ddSpanContext, TraceSource.Event);
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Couldn't generate SpanContext with tracer for durable function.", error);
      }
      return null;
    }
  }

  private deterministicSha256HashToBigIntString(s: string, type: string): string {
    const binaryString = this.deterministicSha256Hash(s, type);
    return BigInt("0b" + binaryString).toString();
  }

  private deterministicSha256Hash(s: string, type: string): string {
    const hash = new Sha256();
    hash.update(s);
    const uint8Array = hash.digestSync();

    let intArray = uint8Array.subarray(0, 8);
    if (type === TRACE_ID) {
      intArray = uint8Array.subarray(8, 16);
    }

    const binaryString = intArray.reduce((acc, num) => acc + this.numberToBinaryString(num), "");
    const res = "0" + binaryString.substring(1, 64);

    if (res === "0".repeat(64)) {
      return "1";
    }
    return res;
  }

  private numberToBinaryString(num: number): string {
    return num.toString(2).padStart(8, "0");
  }
}
