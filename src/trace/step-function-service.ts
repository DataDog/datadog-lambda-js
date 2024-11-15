import { logDebug } from "../utils";
import { SampleMode, TraceSource } from "./trace-context-service";
import { SpanContextWrapper } from "./span-context-wrapper";
import { Sha256 } from "@aws-crypto/sha256-js";

interface StepFunctionRootContext {
  execution_id: string;
  state_entered_time: string;
  state_name: string;
  root_execution_id: string;
  serverless_version: string;
}

interface LambdaRootContext {
  execution_id: string;
  state_entered_time: string;
  state_name: string;
  trace_id: string;
  dd_p_tid: string;
  serverless_version: string;
}

interface LegacyContext {
  execution_id: string;
  state_entered_time: string;
  state_name: string;
}

export type StepFunctionContext = StepFunctionRootContext | LambdaRootContext | LegacyContext;

export const TRACE_ID = "traceId";
export const PARENT_ID = "spanId";
export const DD_P_TID = "_dd.p.tid";

// Type Guard Functions
function isStepFunctionRootContext(obj: any): obj is StepFunctionRootContext {
  return typeof obj?.root_execution_id === "string" && typeof obj?.serverless_version === "string";
}

function isLambdaRootContext(obj: any): obj is LambdaRootContext {
  return (
    typeof obj?.trace_id === "string" &&
    typeof obj?.dd_p_tid === "string" &&
    typeof obj?.serverless_version === "string"
  );
}

function isLegacyContext(obj: any): obj is LegacyContext {
  return (
    typeof obj?.execution_id === "string" &&
    typeof obj?.state_entered_time === "string" &&
    typeof obj?.state_name === "string" &&
    obj?.serverless_version === undefined
  );
}

export class StepFunctionContextService {
  private static _instance: StepFunctionContextService;
  public context?: StepFunctionContext;

  private constructor(event: any) {
    this.setContext(event);
  }

  public static instance(event?: any) {
    return this._instance || (this._instance = new this(event));
  }

  public static reset() {
    this._instance = undefined as any;
  }

  private setContext(event: any) {
    // It is safe to mark this as a singleton since this method will be
    // always triggered by the same event.
    if (typeof event !== "object") return;

    // Extract Payload if available (Legacy lambda parsing)
    if (typeof event.Payload === "object") {
      event = event.Payload;
    }

    // Extract _datadog if available (JSONata v1 parsing)
    if (typeof event._datadog === "object") {
      event = event._datadog;
    }

    // Extract the common context variables
    const stateMachineContext = this.extractStateMachineContext(event);
    if (stateMachineContext === null) return;
    const { execution_id, state_entered_time, state_name } = stateMachineContext;

    if (event.serverless_version === "string" && event.serverless_version == "v1") {
      const serverless_version = event.serverless_version;

      if (event.RootExecutionId === "string") {
        const root_execution_id = event.RootExecutionId;

        this.context = {
          execution_id,
          state_entered_time,
          state_name,
          root_execution_id,
          serverless_version,
        } as StepFunctionRootContext;
      } else if (event.trace_id === "string" && event.dd_p_tid === "string") {
        const trace_id = event.trace_id;
        const dd_p_tid = event.dd_p_tid;

        this.context = {
          execution_id,
          state_entered_time,
          state_name,
          trace_id,
          dd_p_tid,
          serverless_version,
        } as LambdaRootContext;
      }
    } else {
      this.context = { execution_id, state_entered_time, state_name } as LegacyContext;
    }
  }

  public get spanContext(): SpanContextWrapper | null {
    if (this.context === undefined) return null;

    let traceId: string;
    let ptid: string;

    if (isStepFunctionRootContext(this.context)) {
      traceId = this.deterministicSha256HashToBigIntString(this.context.root_execution_id, TRACE_ID);
      ptid = this.deterministicSha256HashToBigIntString(this.context.root_execution_id, DD_P_TID);
    } else if (isLambdaRootContext(this.context)) {
      traceId = this.context["trace_id"];
      ptid = this.context["dd_p_tid"];
    } else if (isLegacyContext(this.context)) {
      traceId = this.deterministicSha256HashToBigIntString(this.context.execution_id, TRACE_ID);
      ptid = this.deterministicSha256HashToBigIntString(this.context.execution_id, DD_P_TID);
    } else {
      logDebug("StepFunctionContext doesn't match any known formats!");
      return null;
    }

    const parentId = this.deterministicSha256HashToBigIntString(
      this.context.execution_id + "#" + this.context.state_name + "#" + this.context.state_entered_time,
      PARENT_ID,
    );
    const sampleMode = SampleMode.AUTO_KEEP;

    try {
      // Try requiring class from the tracer.
      const _DatadogSpanContext = require("dd-trace/packages/dd-trace/src/opentracing/span_context");
      const id = require("dd-trace/packages/dd-trace/src/id");

      const ddSpanContext = new _DatadogSpanContext({
        traceId: id(traceId, 10),
        spanId: id(parentId, 10),
        sampling: { priority: sampleMode.toString(2) },
      });

      ddSpanContext._trace.tags["_dd.p.tid"] = id(ptid, 10).toString(16);
      if (ddSpanContext === null) return null;

      logDebug(`Extracted trace context from StepFunctionContext`, { traceContext: ddSpanContext });

      return new SpanContextWrapper(ddSpanContext, TraceSource.Event);
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Couldn't generate SpanContext with tracer.", error);
      }
      return null;
    }
  }

  private deterministicSha256HashToBigIntString(s: string, type: string): string {
    const binaryString = this.deterministicSha256Hash(s, type);
    return BigInt("0b" + binaryString).toString();
  }

  private deterministicSha256Hash(s: string, type: string): string {
    // returns upper or lower 64 bits of the hash

    const hash = new Sha256();
    hash.update(s);
    const uint8Array = hash.digestSync();
    // type === SPAN_ID || type === DD_P_TID
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

  private extractStateMachineContext(event: any): {
    execution_id: string;
    state_entered_time: string;
    state_name: string;
  } | null {
    const execution = event.Execution;
    const state = event.State;

    if (
      typeof execution === "object" &&
      typeof execution.Id === "string" &&
      typeof state === "object" &&
      typeof state.EnteredTime === "string" &&
      typeof state.Name === "string"
    ) {
      return {
        execution_id: execution.Id,
        state_entered_time: state.EnteredTime,
        state_name: state.Name,
      };
    }

    logDebug("Cannot extract StateMachine context! Invalid execution or state data.");
    return null;
  }
}
