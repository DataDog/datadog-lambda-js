import { PARENT_ID, StepFunctionContextService } from "./step-function-service";

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

      expect(spanContext?.toTraceId()).toBe("1139193989631387307");
      expect(spanContext?.toSpanId()).toBe("5892738536804826142");
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

    it("returns a SpanContextWrapper when event is from legacy lambda", () => {
      const instance = StepFunctionContextService.instance();
      // Force setting event
      instance["setContext"]({ Payload: stepFunctionEvent });

      const spanContext = instance.spanContext;

      expect(spanContext).not.toBeNull();

      expect(spanContext?.toTraceId()).toBe("1139193989631387307");
      expect(spanContext?.toSpanId()).toBe("5892738536804826142");
      expect(spanContext?.sampleMode()).toBe("1");
      expect(spanContext?.source).toBe("event");
    });
  });

  describe("deterministicSha256HashToBigIntString", () => {
    it("returns the same hash number generated in `logs backend` for a random string", () => {
      const instance = StepFunctionContextService.instance();
      const hash = instance["deterministicSha256HashToBigIntString"]("some_testing_random_string", PARENT_ID);
      expect(hash).toEqual("4364271812988819936");
    });

    it("returns the same hash number generated in `logs backend` for execution id # state name # entered time", () => {
      const instance = StepFunctionContextService.instance();
      const hash = instance["deterministicSha256HashToBigIntString"](
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111#step-one#2022-12-08T21:08:19.224Z",
        PARENT_ID,
      );
      expect(hash).toEqual("4340734536022949921");
    });
  });

  describe("deterministicSha256Hash", () => {
    it.each([
      [
        "a random string",
        "some_testing_random_string",
        "0011110010010001000000100001011101001100011100101101100111100000",
      ],
      [
        "an execution id",
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d041f4",
        "0100010100110010010010100001011001110100111011010100110010000100",
      ],
      [
        "another execution id",
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111",
        "0010111110001100100010000101001100110000000000010111011100101011",
      ],
      [
        "execution id # state name # entered time",
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111#step-one#2022-12-08T21:08:19.224Z",
        "0011110000111101011000110000111111110011111010110000000000100001",
      ],
    ])("returns the same hash number generated in `logs backend` for %s", (_, str, expected) => {
      const instance = StepFunctionContextService.instance();
      const hash = instance["deterministicSha256Hash"](str, PARENT_ID);
      expect(hash).toEqual(expected);
    });

    it("returns a hash always leading with 0", () => {
      const instance = StepFunctionContextService.instance();
      for (let i = 0; i < 20; i++) {
        const hash = instance["deterministicSha256Hash"](i.toString(), PARENT_ID);
        expect(hash.substring(0, 1)).toMatch("0");
      }
    });

    it("returns different hashes with different strings", () => {
      const instance = StepFunctionContextService.instance();
      const times = 20;
      for (let i = 0; i < times; i++) {
        for (let j = i + 1; j < times; j++) {
          const hash1 = instance["deterministicSha256Hash"](i.toString(), PARENT_ID);
          const hash2 = instance["deterministicSha256Hash"](j.toString(), PARENT_ID);
          expect(hash1).not.toMatch(hash2);
        }
      }
    });
  });

  describe("numberToBinaryString", () => {
    const instance = StepFunctionContextService.instance();
    it.each([
      [0, "00000000"],
      [1, "00000001"],
      [2, "00000010"],
      [3, "00000011"],
      [4, "00000100"],
    ])("returns the right binary number for %s => %s", (hex, expected) => {
      const binary = instance["numberToBinaryString"](hex);
      expect(binary).toBe(expected);
    });
  });

  describe("test 64 bits deterministicSha256HashToBigIntString for span id", () => {
    const instance = StepFunctionContextService.instance();
    it("first test of #1", () => {
      const actual = instance["deterministicSha256HashToBigIntString"](
        "arn:aws:states:sa-east-1:425362996713:stateMachine:MyStateMachine-b276uka1j#lambda#1",
        PARENT_ID,
      );
      expect(actual).toEqual("3711631873188331089");
    });

    it("test same hashing number is generated as logs-backend for execution id # state name # entered time", () => {
      const actual = instance["deterministicSha256HashToBigIntString"](
        "arn:aws:states:sa-east-1:425362996713:stateMachine:MyStateMachine-b276uka1j#lambda#2",
        PARENT_ID,
      );
      expect(actual).toEqual("5759173372325510050");
    });
  });
});
