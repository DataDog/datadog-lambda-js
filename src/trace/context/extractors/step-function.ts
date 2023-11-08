import { StepFunctionContext, deterministicMd5HashToBigIntString } from "../../step-function-service";
import { SampleMode, Source, TraceContext } from "../extractor";

export function readTraceFromStepFunctionsContext(stepFunctionContext: StepFunctionContext): TraceContext | undefined {
  const traceID = deterministicMd5HashToBigIntString(stepFunctionContext["step_function.execution_id"]);
  const parentID = deterministicMd5HashToBigIntString(
    stepFunctionContext["step_function.execution_id"] +
      "#" +
      stepFunctionContext["step_function.state_name"] +
      "#" +
      stepFunctionContext["step_function.state_entered_time"],
  );

  return {
    parentID,
    traceID,
    sampleMode: SampleMode.AUTO_KEEP.valueOf(),
    source: Source.Event,
  };
}
