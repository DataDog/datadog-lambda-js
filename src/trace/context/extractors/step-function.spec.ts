import { StepFunctionContextService } from "../../step-function-service";
import { StepFunctionEventTraceExtractor } from "./step-function";

describe("StepFunctionEventTraceExtractor", () => {
  beforeEach(() => {
    StepFunctionContextService["_instance"] = undefined as any;
  });
  describe("extract", () => {
    const payload = {
      Execution: {
        Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
        Input: {
          MyInput: "MyValue",
        },
        Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
        RoleArn: "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
        StartTime: "2022-12-08T21:08:17.924Z",
        RedriveCount: "0",
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
    };

    const redrivePayload = {
      Execution: {
        Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
        Input: {
          MyInput: "MyValue",
        },
        Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
        RoleArn: "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
        StartTime: "2022-12-08T21:08:17.924Z",
        RedriveCount: "1",
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
    };
    it("extracts trace context with valid payload", () => {
      // Mimick TraceContextService.extract initialization
      StepFunctionContextService.instance(payload);

      const extractor = new StepFunctionEventTraceExtractor();

      // Payload is sent again for safety in case the instance wasn't previously initialized
      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(traceContext?.toTraceId()).toBe("1139193989631387307");
      expect(traceContext?.toSpanId()).toBe("5892738536804826142");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it("extracts trace context with valid redriven payload", () => {
      // Mimick TraceContextService.extract initialization
      StepFunctionContextService.instance(redrivePayload);

      const extractor = new StepFunctionEventTraceExtractor();

      // Payload is sent again for safety in case the instance wasn't previously initialized
      const traceContext = extractor.extract(redrivePayload);
      expect(traceContext).not.toBeNull();

      expect(traceContext?.toTraceId()).toBe("1139193989631387307");
      expect(traceContext?.toSpanId()).toBe("3615526381891637131");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it("extracts trace context with valid payload when instance wasn't initialized", () => {
      const extractor = new StepFunctionEventTraceExtractor();

      // This should initialize the current context
      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(traceContext?.toTraceId()).toBe("1139193989631387307");
      expect(traceContext?.toSpanId()).toBe("5892738536804826142");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it("extracts trace context with valid legacy lambda payload", () => {
      // Mimick TraceContextService.extract initialization
      StepFunctionContextService.instance({ Payload: payload });

      const extractor = new StepFunctionEventTraceExtractor();

      // Payload is sent again for safety in case the instance wasn't previously initialized
      const traceContext = extractor.extract({ Payload: payload });
      expect(traceContext).not.toBeNull();

      expect(traceContext?.toTraceId()).toBe("1139193989631387307");
      expect(traceContext?.toSpanId()).toBe("5892738536804826142");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it("returns null when StepFunctionContextService.context is undefined", async () => {
      const extractor = new StepFunctionEventTraceExtractor();

      const traceContext = extractor.extract({});
      expect(traceContext).toBeNull();
    });
  });
});
