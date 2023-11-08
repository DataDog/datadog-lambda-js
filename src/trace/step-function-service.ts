import { Md5 } from "ts-md5";
import { logDebug } from "../utils";

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

export function hexToBinary(hex: string) {
  // convert hex to binary and padding with 0 in the front to fill 128 bits
  return parseInt(hex, 16).toString(2).padStart(4, "0");
}

export function deterministicMd5HashInBinary(s: string): string {
  // Md5 here is used here because we don't need a cryptographically secure hashing method but to generate the same trace/span ids as the backend does
  const hex = Md5.hashStr(s);

  let binary = "";
  for (let i = 0; i < hex.length; i++) {
    const ch = hex.charAt(i);
    binary = binary + hexToBinary(ch);
  }

  const res = "0" + binary.substring(1, 64);
  if (res === "0".repeat(64)) {
    return "1";
  }
  return res;
}

export function deterministicMd5HashToBigIntString(s: string): string {
  const binaryString = deterministicMd5HashInBinary(s);
  return BigInt("0b" + binaryString).toString();
}

export function readStepFunctionContextFromEvent(event: any): StepFunctionContext | undefined {
  if (typeof event !== "object") {
    return;
  }

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

  const state = event.State;
  if (typeof state !== "object") {
    logDebug("event.State is not an object.");
    return;
  }
  const stateRetryCount = state.RetryCount;
  if (typeof stateRetryCount !== "number") {
    logDebug("event.State.RetryCount is not a string.");
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

  return {
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
}
