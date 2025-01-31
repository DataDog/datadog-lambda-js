import { PARENT_ID, StepFunctionContextService } from "./step-function-service";

describe("StepFunctionContextService", () => {
  const legacyStepFunctionEvent = {
    Execution: {
      Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
      Input: {
        MyInput: "MyValue",
      },
      Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
      RoleArn: "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
      RedriveCount: 0,
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
  const lambdaRootStepFunctionEvent = {
    _datadog: {
      Execution: {
        Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
        Input: {
          MyInput: "MyValue",
        },
        Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
        RoleArn: "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
        RedriveCount: 0,
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
      "x-datadog-trace-id": "10593586103637578129",
      "x-datadog-tags": "_dd.p.dm=-0,_dd.p.tid=6734e7c300000000",
      "serverless-version": "v1",
    },
  } as const;
  const nestedStepFunctionEvent = {
    _datadog: {
      Execution: {
        Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
        Input: {
          MyInput: "MyValue",
        },
        Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
        RoleArn: "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
        RedriveCount: 0,
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
      RootExecutionId:
        "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:a1b2c3d4-e5f6-7890-1234-56789abcdef0:9f8e7d6c-5b4a-3c2d-1e0f-123456789abc",
      "serverless-version": "v1",
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
        "Execution is not defined",
        {
          ...legacyStepFunctionEvent,
          Execution: undefined,
        },
      ],
      [
        "Execution Id is not a string",
        {
          ...legacyStepFunctionEvent,
          Execution: {
            ...legacyStepFunctionEvent.Execution,
            Id: 1,
          },
        },
      ],
      [
        "State is not defined",
        {
          ...legacyStepFunctionEvent,
          State: undefined,
        },
      ],
      [
        "State EnteredTime is not a string",
        {
          ...legacyStepFunctionEvent,
          State: {
            ...legacyStepFunctionEvent.State,
            EnteredTime: 12345,
          },
        },
      ],
      [
        "State Name is not a string",
        {
          ...legacyStepFunctionEvent,
          State: {
            ...legacyStepFunctionEvent,
            Name: 1,
          },
        },
      ],
    ])("skips setting context  when `%s`", (_, event) => {
      const instance = StepFunctionContextService.instance(event);
      instance["setContext"](event);
      expect(instance.context).toBeUndefined();
    });

    it("sets context from valid legacy event", () => {
      const instance = StepFunctionContextService.instance();
      // Force setting event
      instance["setContext"](legacyStepFunctionEvent);
      expect(instance.context).toEqual({
        execution_id:
          "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
        redrive_count: "0",
        state_entered_time: "2022-12-08T21:08:19.224Z",
        state_name: "step-one",
      });
    });

    it("sets context from valid nested event", () => {
      const instance = StepFunctionContextService.instance();
      // Force setting event
      instance["setContext"](nestedStepFunctionEvent);
      expect(instance.context).toEqual({
        execution_id:
          "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
        redrive_count: "0",
        state_entered_time: "2022-12-08T21:08:19.224Z",
        state_name: "step-one",
        root_execution_id:
          "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:a1b2c3d4-e5f6-7890-1234-56789abcdef0:9f8e7d6c-5b4a-3c2d-1e0f-123456789abc",
        serverless_version: "v1",
      });
    });

    it("sets context from valid Lambda root event", () => {
      const instance = StepFunctionContextService.instance();
      // Force setting event
      instance["setContext"](lambdaRootStepFunctionEvent);
      expect(instance.context).toEqual({
        execution_id:
          "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
        redrive_count: "0",
        state_entered_time: "2022-12-08T21:08:19.224Z",
        state_name: "step-one",
        trace_id: "10593586103637578129",
        dd_p_tid: "6734e7c300000000",
        serverless_version: "v1",
      });
    });
  });

  describe("spanContext", () => {
    beforeEach(() => {
      jest.resetModules();
      StepFunctionContextService["_instance"] = undefined as any;
    });
    it("returns a SpanContextWrapper when legacy event is valid", () => {
      const instance = StepFunctionContextService.instance();
      // Force setting event
      instance["setContext"](legacyStepFunctionEvent);

      const spanContext = instance.spanContext;

      expect(spanContext).not.toBeNull();

      expect(spanContext?.toTraceId()).toBe("1139193989631387307");
      expect(spanContext?.toSpanId()).toBe("5892738536804826142");
      expect(spanContext?.sampleMode()).toBe("1");
      expect(spanContext?.source).toBe("event");
    });

    it("returns a SpanContextWrapper when nested event is valid", () => {
      const instance = StepFunctionContextService.instance();
      // Force setting event
      instance["setContext"](nestedStepFunctionEvent);

      const spanContext = instance.spanContext;

      expect(spanContext).not.toBeNull();

      expect(spanContext?.toTraceId()).toBe("8676990472248253142");
      expect(spanContext?.toSpanId()).toBe("5892738536804826142");
      expect(spanContext?.sampleMode()).toBe("1");
      expect(spanContext?.source).toBe("event");
    });

    it("returns a SpanContextWrapper when Lambda root event is valid", () => {
      const instance = StepFunctionContextService.instance();
      // Force setting event
      instance["setContext"](lambdaRootStepFunctionEvent);

      const spanContext = instance.spanContext;

      expect(spanContext).not.toBeNull();

      expect(spanContext?.toTraceId()).toBe("10593586103637578129");
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
      instance["setContext"]({ Payload: legacyStepFunctionEvent });

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
