import { TracerWrapper } from "../../tracer-wrapper";
import { StepFunctionEventBridgeTraceExtractor} from "./step-function-event-bridge";

import { StepFunctionContextService } from "../../step-function-service";

describe("StepFunctionEventBridgeTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      StepFunctionContextService["_instance"] = undefined as any;
    });

    it("extracts trace context with valid payload", () => {
      const tracerWrapper = new TracerWrapper();

      const payload = {
        version: "0",
        id: "af718b2a-b987-e8c0-7a2b-a188fad2661a",
        "detail-type": "ProcessEvent",
        source: "demo.stepfunction",
        account: "123456123456",
        time: "2025-07-11T14:59:35Z",
        region: "us-east-2",
        resources: [
          "arn:aws:states:us-east-2:123456123456:stateMachine:rstrat-rstrat-sfn-evb-demo-dev-state-machine",
          "arn:aws:states:us-east-2:123456123456:execution:rstrat-rstrat-sfn-evb-demo-dev-state-machine:6c190e7b-eb77-46db-af26-9066d353b105"
        ],
        detail: {
          "message": "Event from Step Functions",
          "timestamp": "2025-07-11T14:59:35.830Z",
          "executionName": "6c190e7b-eb77-46db-af26-9066d353b105",
          "stateMachineName": "rstrat-rstrat-sfn-evb-demo-dev-state-machine",
          "input": {
            "testData": "Hello with Datadog tracing"
          },
          "_datadog": {
            "Execution": {
              "Id": "arn:aws:states:us-east-2:123456123456:execution:rstrat-rstrat-sfn-evb-demo-dev-state-machine:6c190e7b-eb77-46db-af26-9066d353b105",
              "StartTime": "2025-07-11T14:59:35.806Z",
              "Name": "6c190e7b-eb77-46db-af26-9066d353b105",
              "RoleArn": "arn:aws:iam::123456123456:role/rstrat-sfn-evb-demo-dev-StepFunctionsExecutionRole-8maJHu01fhZZ",
              "RedriveCount": 0
            },
            "StateMachine": {
              "Id": "arn:aws:states:us-east-2:123456123456:stateMachine:rstrat-rstrat-sfn-evb-demo-dev-state-machine",
              "Name": "rstrat-rstrat-sfn-evb-demo-dev-state-machine"
            },
            "State": {
              "Name": "PublishToEventBridge",
              "EnteredTime": "2025-07-11T14:59:35.830Z",
              "RetryCount": 0
            },
            "RootExecutionId": "arn:aws:states:us-east-2:123456123456:execution:rstrat-rstrat-sfn-evb-demo-dev-state-machine:6c190e7b-eb77-46db-af26-9066d353b105",
            "serverless-version": "v1"
          }
        },
      };

      const extractor = new StepFunctionEventBridgeTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(traceContext?.toTraceId()).toBe("1725252773470455797");
      expect(traceContext?.toSpanId()).toBe("2609403927341182651");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });
  })
})
