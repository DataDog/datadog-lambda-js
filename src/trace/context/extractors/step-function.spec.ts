import { StepFunctionContextService } from "../../step-function-service";
import { StepFunctionEventTraceExtractor } from "./step-function";
import { TracerWrapper } from "../../tracer-wrapper";

describe("StepFunctionEventTraceExtractor", () => {
  beforeEach(() => {
    StepFunctionContextService["_instance"] = undefined as any;
  });
  describe("extract", () => {
    const payload = {
      Execution: {
        Id: "arn:aws:states:sa-east-1:425362996713:execution:abhinav-activity-state-machine:72a7ca3e-901c-41bb-b5a3-5f279b92a316",
        Name: "72a7ca3e-901c-41bb-b5a3-5f279b92a316",
        RoleArn:
          "arn:aws:iam::425362996713:role/service-role/StepFunctions-abhinav-activity-state-machine-role-22jpbgl6j",
        StartTime: "2024-12-04T19:38:04.069Z",
      },
      State: {
        Name: "Lambda Invoke",
        EnteredTime: "2024-12-04T19:38:04.118Z",
        RetryCount: 0,
      },
      StateMachine: {
        Id: "arn:aws:states:sa-east-1:425362996713:stateMachine:abhinav-activity-state-machine",
        Name: "abhinav-activity-state-machine",
      },
    };

    const redrivePayload = {
      Execution: {
        Id: "arn:aws:states:sa-east-1:425362996713:execution:abhinav-activity-state-machine:72a7ca3e-901c-41bb-b5a3-5f279b92a316",
        Name: "72a7ca3e-901c-41bb-b5a3-5f279b92a316",
        RoleArn:
          "arn:aws:iam::425362996713:role/service-role/StepFunctions-abhinav-activity-state-machine-role-22jpbgl6j",
        StartTime: "2024-12-04T19:38:04.069Z",
        RedriveCount: 1,
      },
      State: {
        Name: "Lambda Invoke",
        EnteredTime: "2024-12-04T19:38:04.118Z",
        RetryCount: 0,
      },
      StateMachine: {
        Id: "arn:aws:states:sa-east-1:425362996713:stateMachine:abhinav-activity-state-machine",
        Name: "abhinav-activity-state-machine",
      },
    };
    it("extracts trace context with valid payload", () => {
      // Mimick TraceContextService.extract initialization
      StepFunctionContextService.instance(payload);

      const extractor = new StepFunctionEventTraceExtractor();

      // Payload is sent again for safety in case the instance wasn't previously initialized
      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(traceContext?.toTraceId()).toBe("435175499815315247");
      expect(traceContext?.toSpanId()).toBe("3929055471293792800");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    // https://github.com/DataDog/logs-backend/blob/c17618cb552fc369ca40282bae0a65803f82f694/domains/serverless/apps/logs-to-traces-reducer/src/test/resources/test-json-files/stepfunctions/RedriveTest/snapshots/RedriveLambdaSuccessTraceMerging.json#L46
    it("extracts trace context with valid redriven payload", () => {
      // Mimick TraceContextService.extract initialization
      StepFunctionContextService.instance(redrivePayload);

      const extractor = new StepFunctionEventTraceExtractor();

      // Payload is sent again for safety in case the instance wasn't previously initialized
      const traceContext = extractor.extract(redrivePayload);
      expect(traceContext).not.toBeNull();

      expect(traceContext?.toTraceId()).toBe("435175499815315247");
      expect(traceContext?.toSpanId()).toBe("8782364156266188026");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it("extracts trace context with valid payload when instance wasn't initialized", () => {
      const extractor = new StepFunctionEventTraceExtractor();

      // This should initialize the current context
      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(traceContext?.toTraceId()).toBe("435175499815315247");
      expect(traceContext?.toSpanId()).toBe("3929055471293792800");
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

      expect(traceContext?.toTraceId()).toBe("435175499815315247");
      expect(traceContext?.toSpanId()).toBe("3929055471293792800");
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
