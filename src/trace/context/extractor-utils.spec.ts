import { TracerWrapper } from "../tracer-wrapper";
import { extractTraceContext, extractFromAWSTraceHeader } from "./extractor-utils";
import { StepFunctionContextService } from "../step-function-service";

describe("extractor-utils", () => {
  beforeEach(() => {
    StepFunctionContextService["_instance"] = undefined as any;
  });
  describe("extractTraceContext", () => {
    it("returns span context when tracer wrapper successfully extracts from headers", () => {
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
      };

      const tracerWrapper = new TracerWrapper();
      const result = extractTraceContext(legacyStepFunctionEvent, tracerWrapper);

      // Should return a span context from Step Function context since headers extraction fails
      expect(result).not.toBeNull();
    });

    it("returns an empty array when no trace context can be extracted", () => {
      const emptyEvent = {
        someOtherProperty: "value",
      };

      const tracerWrapper = new TracerWrapper();
      const result = extractTraceContext(emptyEvent, tracerWrapper);

      expect(result).toStrictEqual([]);
    });

    it("extracts context from LambdaRootStepFunctionContext", () => {
      const lambdaRootStepFunctionEvent = {
        _datadog: {
          Execution: {
            Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
            Input: {
              MyInput: "MyValue",
            },
            Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
            RoleArn:
              "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
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
      };

      const tracerWrapper = new TracerWrapper();
      const result = extractTraceContext(lambdaRootStepFunctionEvent, tracerWrapper);

      expect(result).not.toBeNull();
    });

    it("extracts context from NestedStepFunctionContext", () => {
      const nestedStepFunctionEvent = {
        _datadog: {
          Execution: {
            Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
            Input: {
              MyInput: "MyValue",
            },
            Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
            RoleArn:
              "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
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
      };

      const tracerWrapper = new TracerWrapper();
      const result = extractTraceContext(nestedStepFunctionEvent, tracerWrapper);

      expect(result).not.toBeNull();
    });

    it("extracts context from legacy lambda StepFunctionContext", () => {
      const event = {
        Payload: {
          Execution: {
            Id: "arn:aws:states:sa-east-1:425362996713:express:logs-to-traces-sequential:85a9933e-9e11-83dc-6a61-b92367b6c3be:3f7ef5c7-c8b8-4c88-90a1-d54aa7e7e2bf",
            Input: {
              MyInput: "MyValue",
            },
            Name: "85a9933e-9e11-83dc-6a61-b92367b6c3be",
            RoleArn:
              "arn:aws:iam::425362996713:role/service-role/StepFunctions-logs-to-traces-sequential-role-ccd69c03",
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
        },
      };

      const tracerWrapper = new TracerWrapper();
      const result = extractTraceContext(event, tracerWrapper);

      expect(result).not.toBeNull();
    });
  });

  describe("extractFromAWSTraceHeader", () => {
    it("returns null when AWS trace header is invalid", () => {
      const invalidHeader = "invalid-header";
      const eventType = "SQS";

      const result = extractFromAWSTraceHeader(invalidHeader, eventType);

      expect(result).toStrictEqual([]);
    });
  });
});
