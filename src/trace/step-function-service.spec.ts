import { StepFunctionContextService } from "./step-function-service";

describe("StepFunctionContextService", () => {
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
  describe("instance", () => {
    it("returns the same instance every time", () => {
      const instance1 = StepFunctionContextService.instance();
      const instance2 = StepFunctionContextService.instance();

      expect(instance1).toBe(instance2);
    });
  });

  describe("setContext", () => {
    beforeEach(() => {
      jest.resetModules();
      StepFunctionContextService["_instance"] = undefined as any;
    });

    it.each([
      ["event is not an object", "event"],
      ["event is missing Execution property", {}],
      [
        "Execution is missing Name field",
        {
          ...stepFunctionEvent,
          Execution: {},
        },
      ],
      [
        "Execution Id is not a string",
        {
          ...stepFunctionEvent,
          Execution: {
            ...stepFunctionEvent.Execution,
            Id: 1,
          },
        },
      ],
      [
        "Execution Name isn't a string",
        {
          ...stepFunctionEvent,
          Execution: {
            ...stepFunctionEvent.Execution,
            Name: 12345,
          },
        },
      ],
      [
        "Execution RoleArn isn't a string",
        {
          ...stepFunctionEvent,
          Execution: {
            ...stepFunctionEvent.Execution,
            RoleArn: 12345,
          },
        },
      ],
      [
        "Execution StartTime isn't a string",
        {
          ...stepFunctionEvent,
          Execution: {
            ...stepFunctionEvent.Execution,
            StartTime: 12345,
          },
        },
      ],
      [
        "State is not defined",
        {
          ...stepFunctionEvent,
          State: undefined,
        },
      ],
      [
        "State RetryCount is not a number",
        {
          ...stepFunctionEvent,
          State: {
            ...stepFunctionEvent.State,
            RetryCount: "1",
          },
        },
      ],
      [
        "State EnteredTime is not a string",
        {
          ...stepFunctionEvent,
          State: {
            ...stepFunctionEvent.State,
            EnteredTime: 12345,
          },
        },
      ],
      [
        "State Name is not a string",
        {
          ...stepFunctionEvent,
          State: {
            ...stepFunctionEvent,
            Name: 1,
          },
        },
      ],
      [
        "StateMachine is undefined",
        {
          ...stepFunctionEvent,
          StateMachine: undefined,
        },
      ],
      [
        "StateMachine Id is not a string",
        {
          ...stepFunctionEvent,
          StateMachine: {
            ...stepFunctionEvent.StateMachine,
            Id: 1,
          },
        },
      ],
      [
        "StateMachine Name is not a string",
        {
          ...stepFunctionEvent,
          StateMachine: {
            ...stepFunctionEvent.StateMachine,
            Name: 1,
          },
        },
      ],
    ])("skips setting context  when `%s`", (_, event) => {
      const instance = StepFunctionContextService.instance(event);
      instance["setContext"](event);
      expect(instance.context).toBeUndefined();
    });

    it("sets context from valid event", () => {
      const instance = StepFunctionContextService.instance();
      // Force setting event
      instance["setContext"](stepFunctionEvent);
      expect(instance.context).toEqual({
        "step_function.execution_id":
          "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
        "step_function.execution_input": {
          MyInput: "MyValue",
        },
        "step_function.execution_name": "85a9933e-9e11-83dc-6a61-b92367b6c3be",
        "step_function.execution_role_arn":
          "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
        "step_function.execution_start_time": "2022-12-08T21:08:17.924Z",
        "step_function.state_entered_time": "2022-12-08T21:08:19.224Z",
        "step_function.state_machine_arn":
          "arn:aws:states:sa-east-1:425362996713:stateMachine:logs-to-traces-sequential",
        "step_function.state_machine_name": "my-state-machine",
        "step_function.state_name": "step-one",
        "step_function.state_retry_count": 2,
      });
    });
  });

  describe("spanContext", () => {
    beforeEach(() => {
      jest.resetModules();
      StepFunctionContextService["_instance"] = undefined as any;
    });
    it("returns a SpanContextWrapper when event is valid", () => {
      const instance = StepFunctionContextService.instance();
      // Force setting event
      instance["setContext"](stepFunctionEvent);

      const spanContext = instance.spanContext;

      expect(spanContext).not.toBeNull();

      expect(spanContext?.toTraceId()).toBe("947965466153612645");
      expect(spanContext?.toSpanId()).toBe("4602916161841036335");
      expect(spanContext?.sampleMode()).toBe("1");
      expect(spanContext?.source).toBe("event");
    });

    it("returns null when context is not set", () => {
      const instance = StepFunctionContextService.instance();
      // Force setting event
      instance["setContext"]({});

      const spanContext = instance.spanContext;

      expect(spanContext).toBeNull();
    });
  });

  describe("deterministicMd5HashToBigIntString", () => {
    it("returns the same hash number generated in `logs backend` for a random string", () => {
      const instance = StepFunctionContextService.instance();
      const hash = instance["deterministicMd5HashToBigIntString"]("some_testing_random_string");
      expect(hash).toEqual("2251275791555400689");
    });

    it("returns the same hash number generated in `logs backend` for execution id # state name # entered time", () => {
      const instance = StepFunctionContextService.instance();
      const hash = instance["deterministicMd5HashToBigIntString"](
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111#step-one#2022-12-08T21:08:19.224Z",
      );
      expect(hash).toEqual("8034507082463708833");
    });
  });

  describe("deterministicMd5HashInBinary", () => {
    it.each([
      [
        "a random string",
        "some_testing_random_string",
        "0001111100111110001000110110011110010111000110001001001111110001",
      ],
      [
        "an execution id",
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d041f4",
        "0010010000101100100000101011111101111100110110001110111100111101",
      ],
      [
        "another execution id",
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111",
        "0010001100110000011011011111010000100111100000110000100100101010",
      ],
      [
        "execution id # state name # entered time",
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111#step-one#2022-12-08T21:08:19.224Z",
        "0110111110000000010011011001111101110011100111000000011010100001",
      ],
    ])("returns the same hash number generated in `logs backend` for %s", (_, str, expected) => {
      const instance = StepFunctionContextService.instance();
      const hash = instance["deterministicMd5HashInBinary"](str);
      expect(hash).toEqual(expected);
    });

    it("returns a hash always leading with 0", () => {
      const instance = StepFunctionContextService.instance();
      for (let i = 0; i < 20; i++) {
        const hash = instance["deterministicMd5HashInBinary"](i.toString());
        expect(hash.substring(0, 1)).toMatch("0");
      }
    });

    it("returns different hashes with different strings", () => {
      const instance = StepFunctionContextService.instance();
      const times = 20;
      for (let i = 0; i < times; i++) {
        for (let j = i + 1; j < times; j++) {
          const hash1 = instance["deterministicMd5HashInBinary"](i.toString());
          const hash2 = instance["deterministicMd5HashInBinary"](j.toString());
          expect(hash1).not.toMatch(hash2);
        }
      }
    });
  });

  describe("hexToBinary", () => {
    const instance = StepFunctionContextService.instance();
    it.each([
      ["0", "0000"],
      ["1", "0001"],
      ["2", "0010"],
      ["3", "0011"],
      ["4", "0100"],
      ["5", "0101"],
      ["6", "0110"],
      ["7", "0111"],
      ["8", "1000"],
      ["9", "1001"],
      ["a", "1010"],
      ["b", "1011"],
      ["c", "1100"],
      ["d", "1101"],
      ["e", "1110"],
      ["f", "1111"],
    ])("returns the right binary number for %s => %s", (hex, expected) => {
      const binary = instance["hexToBinary"](hex);
      expect(binary).toBe(expected);
    });
  });
});
