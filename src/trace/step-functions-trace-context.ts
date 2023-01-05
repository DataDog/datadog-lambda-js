import { StepFunctionContext } from "./context";
import { Md5 } from "ts-md5";
import { SpanContext } from "./tracer-wrapper";

export function getStepFunctionsParentContext(stepFunctionContext: StepFunctionContext): SpanContext {
  return {
    toTraceId() {
      return deterministicMd5HashToBigIntString(stepFunctionContext["step_function.execution_id"]);
    },
    toSpanId() {
      return deterministicMd5HashToBigIntString(
        stepFunctionContext["step_function.execution_id"] +
          "#" +
          stepFunctionContext["step_function.state_name"] +
          "#" +
          stepFunctionContext["step_function.state_entered_time"],
      );
    },
  };
}

export function hexToBinary(hex: string) {
  // convert hex to binary and padding with 0 in the front to fill 128 bits
  return parseInt(hex, 16).toString(2).padStart(4, "0");
}

export function deterministicMd5HashInBinary(s: string): string {
  // Md5 here is not used as an encryption method but to generate a deterministic hash as the backend does
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
