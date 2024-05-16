import { _128_BITS, _64_BITS, StepFunctionContextService } from "./step-function-service";

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

      expect(spanContext?.toTraceId()).toBe("3661440683");
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
  });

  describe("deterministicSha256HashToBigIntString", () => {
    it("returns the same hash number generated in `logs backend` for a random string", () => {
      const instance = StepFunctionContextService.instance();
      const hash = instance["deterministicSha256HashToBigIntString"]("some_testing_random_string", _128_BITS);
      expect(hash).toEqual("80506605202309154694697844088692857990");
    });

    it("returns the same hash number generated in `logs backend` for execution id # state name # entered time", () => {
      const instance = StepFunctionContextService.instance();
      const hash = instance["deterministicSha256HashToBigIntString"](
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111#step-one#2022-12-08T21:08:19.224Z",
        _128_BITS,
      );
      expect(hash).toEqual("80072419077927731656239868244106251139");
    });
  });

  describe("deterministicSha256Hash", () => {
    it.each([
      [
        "a random string",
        "some_testing_random_string",
        "00111100100100010000001000010111010011000111001011011001111000000110011101111001100001011100111110110001011111001101110010000110",
      ],
      [
        "an execution id",
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d041f4",
        "01000101001100100100101000010110011101001110110101001100100001000100010111011110010011011100010100101011110110011010110001111110",
      ],
      [
        "another execution id",
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111",
        "00101111100011001000100001010011001100000000000101110111001010110100110111010111011001101001111001110001011111000111010010101001",
      ],
      [
        "execution id # state name # entered time",
        "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111#step-one#2022-12-08T21:08:19.224Z",
        "00111100001111010110001100001111111100111110101100000000001000010011110011111110111010000100011111010100111110011000101110000011",
      ],
    ])("returns the same hash number generated in `logs backend` for %s", (_, str, expected) => {
      const instance = StepFunctionContextService.instance();
      const hash = instance["deterministicSha256Hash"](str, _128_BITS);
      expect(hash).toEqual(expected);
    });

    it("returns a hash always leading with 0", () => {
      const instance = StepFunctionContextService.instance();
      for (let i = 0; i < 20; i++) {
        const hash = instance["deterministicSha256Hash"](i.toString(), _128_BITS);
        expect(hash.substring(0, 1)).toMatch("0");
      }
    });

    it("returns different hashes with different strings", () => {
      const instance = StepFunctionContextService.instance();
      const times = 20;
      for (let i = 0; i < times; i++) {
        for (let j = i + 1; j < times; j++) {
          const hash1 = instance["deterministicSha256Hash"](i.toString(), _128_BITS);
          const hash2 = instance["deterministicSha256Hash"](j.toString(), _128_BITS);
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
        _64_BITS,
      );
      expect(actual).toEqual("3711631873188331089");
    });

    it("test same hashing number is generated as logs-backend for execution id # state name # entered time", () => {
      const actual = instance["deterministicSha256HashToBigIntString"](
        "arn:aws:states:sa-east-1:425362996713:stateMachine:MyStateMachine-b276uka1j#lambda#2",
        _64_BITS,
      );
      expect(actual).toEqual("5759173372325510050");
    });
  });
});
