import { readStepFunctionContextFromEvent } from "../../step-function-service";

describe("readStepFunctionContextFromEvent", () => {
  const stepFunctionEvent = {
    Execution: {
      Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
      Input: {
        MyInput: "MyValue",
      },
      Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
      RoleArn: "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
      StartTime: "2022-12-08T21:08:17.924Z",
    },
    State: {
      Name: "step-one",
      EnteredTime: "2022-12-08T21:08:19.224Z",
      RetryCount: 2,
    },
    StateMachine: {
      Id: "arn:aws:states:sa-east-1:425362996713:stateMachine:logs-to-traces-sequential",
      Name: "my-state-machine",
    },
  } as const;

  it("reads a step function context from event with Execution.Input", () => {
    const result = readStepFunctionContextFromEvent(stepFunctionEvent);
    expect(result).toEqual({
      "step_function.execution_id":
        "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
      "step_function.execution_input": { MyInput: "MyValue" },
      "step_function.execution_name": "85a9933e-9e11-83dc-6a61-b92367b6c3be",
      "step_function.execution_role_arn":
        "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
      "step_function.execution_start_time": "2022-12-08T21:08:17.924Z",
      "step_function.state_entered_time": "2022-12-08T21:08:19.224Z",
      "step_function.state_machine_arn": "arn:aws:states:sa-east-1:425362996713:stateMachine:logs-to-traces-sequential",
      "step_function.state_machine_name": "my-state-machine",
      "step_function.state_name": "step-one",
      "step_function.state_retry_count": 2,
    });
  });
  it("returns undefined when event isn't an object", () => {
    const result = readStepFunctionContextFromEvent("event");
    expect(result).toBeUndefined();
  });
  it("returns undefined when event is missing datadogContext property", () => {
    const result = readStepFunctionContextFromEvent({});
    expect(result).toBeUndefined();
  });
  it("returns undefined when datadogContext is missing Execution property", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {},
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when Execution is missing Name field", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent,
        Execution: {},
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when Name isn't a string", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent,
        Execution: {
          Name: 12345,
        },
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when State isn't defined", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent,
        State: undefined,
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when try retry count isn't a number", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent,
        State: {
          ...stepFunctionEvent.State,
          RetryCount: "1",
        },
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when try step name isn't a string", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent,
        State: {
          ...stepFunctionEvent.State,
          Name: 1,
        },
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when StateMachine is undefined", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent,
        StateMachine: undefined,
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when StateMachineId isn't a string", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent,
        StateMachine: {
          ...stepFunctionEvent.StateMachine,
          Id: 1,
        },
      },
    });
    expect(result).toBeUndefined();
  });
  it("returns undefined when StateMachineName isn't a string", () => {
    const result = readStepFunctionContextFromEvent({
      dd: {
        ...stepFunctionEvent,
        StateMachine: {
          ...stepFunctionEvent.StateMachine,
          Name: 1,
        },
      },
    });
    expect(result).toBeUndefined();
  });
});
