import { logDebug } from "../utils";
import { SampleMode, TraceSource } from "./trace-context-service";
import { SpanContextWrapper } from "./span-context-wrapper";
import { Sha256 } from '@aws-crypto/sha256-js';

export interface StepFunctionContext {
  "step_function.execution_name": string;
  "step_function.execution_id": string;
  "step_function.execution_input": object;
  "step_function.execution_role_arn": string;
  "step_function.execution_start_time": string;
  "step_function.state_machine_name": string;
  "step_function.state_machine_arn": string;
  "step_function.state_entered_time": string;
  "step_function.state_name": string;
  "step_function.state_retry_count": number;
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

    // Execution
    const execution = event.Execution;
    if (typeof execution !== "object") {
      logDebug("event.Execution is not an object.");
      return;
    }
    const executionID = execution.Id;
    if (typeof executionID !== "string") {
      logDebug("event.Execution.Id is not a string.");
      return;
    }
    const executionInput = execution.Input;
    const executionName = execution.Name;
    if (typeof executionName !== "string") {
      logDebug("event.Execution.Name is not a string.");
      return;
    }
    const executionRoleArn = execution.RoleArn;
    if (typeof executionRoleArn !== "string") {
      logDebug("event.Execution.RoleArn is not a string.");
      return;
    }
    const executionStartTime = execution.StartTime;
    if (typeof executionStartTime !== "string") {
      logDebug("event.Execution.StartTime is not a string.");
      return;
    }

    // State
    const state = event.State;
    if (typeof state !== "object") {
      logDebug("event.State is not an object.");
      return;
    }
    const stateRetryCount = state.RetryCount;
    if (typeof stateRetryCount !== "number") {
      logDebug("event.State.RetryCount is not a number.");
      return;
    }
    const stateEnteredTime = state.EnteredTime;
    if (typeof stateEnteredTime !== "string") {
      logDebug("event.State.EnteredTime is not a string.");
      return;
    }
    const stateName = state.Name;
    if (typeof stateName !== "string") {
      logDebug("event.State.Name is not a string.");
      return;
    }

    // StateMachine
    const stateMachine = event.StateMachine;
    if (typeof stateMachine !== "object") {
      logDebug("event.StateMachine is not an object.");
      return;
    }
    const stateMachineArn = stateMachine.Id;
    if (typeof stateMachineArn !== "string") {
      logDebug("event.StateMachine.Id is not a string.");
      return;
    }
    const stateMachineName = stateMachine.Name;
    if (typeof stateMachineName !== "string") {
      logDebug("event.StateMachine.Name is not a string.");
      return;
    }

    const context = {
      "step_function.execution_name": executionName,
      "step_function.execution_id": executionID,
      "step_function.execution_input": executionInput ?? {},
      "step_function.execution_role_arn": executionRoleArn,
      "step_function.execution_start_time": executionStartTime,
      "step_function.state_entered_time": stateEnteredTime,
      "step_function.state_machine_arn": stateMachineArn,
      "step_function.state_machine_name": stateMachineName,
      "step_function.state_name": stateName,
      "step_function.state_retry_count": stateRetryCount,
    };

    this.context = context;
  }

  public get spanContext(): SpanContextWrapper | null {
    if (this.context === undefined) return null;

    const traceId = this.deterministicMd5HashToBigIntString(this.context["step_function.execution_id"]);
    const parentId = this.deterministicMd5HashToBigIntString(
      this.context["step_function.execution_id"] +
        "#" +
        this.context["step_function.state_name"] +
        "#" +
        this.context["step_function.state_entered_time"],
    );
    const sampleMode = SampleMode.AUTO_KEEP;

    const spanContext = SpanContextWrapper.fromTraceContext({
      traceId,
      parentId,
      sampleMode,
      source: TraceSource.Event,
    });

    if (spanContext === null) return null;
    logDebug(`Extracted trace context from StepFunctionContext`, { traceContext: this.context });
    return spanContext;
  }

  private deterministicMd5HashToBigIntString(s: string): string {
    const binaryString = this.deterministicMd5HashInBinary(s);
    return BigInt("0b" + binaryString).toString();
  }

  private deterministicMd5HashInBinary(s: string): string {
    const hash = new Sha256();
    hash.update(s);
    const hex = hash.digestSync().subarray(0, 16);

    let binary = "";
    for (const num of hex) {
      const currentBinary = num.toString(2)
      binary = binary + currentBinary
    }

    const res = "0" + binary.substring(1, 128);
    if (res === "0".repeat(128)) {
      return "1";
    }
    return res;
  }
}
