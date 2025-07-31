import { TracerWrapper } from "../../tracer-wrapper";
import { EventBridgeEventTraceExtractor } from "./event-bridge";
import { StepFunctionContextService } from "../../step-function-service";

let mockSpanContext: any = null;

// Mocking extract is needed, due to dd-trace being a No-op
// if the detected environment is testing. This is expected, since
// we don't want to test dd-trace extraction, but our components.
const ddTrace = require("dd-trace");
jest.mock("dd-trace", () => {
  return {
    ...ddTrace,
    _tracer: { _service: {} },
    extract: (_carrier: any, _headers: any) => mockSpanContext,
  };
});
const spyTracerWrapper = jest.spyOn(TracerWrapper.prototype, "extract");

describe("EventBridgeEventTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
    });

    afterEach(() => {
      jest.resetModules();
    });

    it("extracts trace context with valid payload", () => {
      mockSpanContext = {
        toTraceId: () => "5827606813695714842",
        toSpanId: () => "4726693487091824375",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
        version: "0",
        id: "bd3c8258-8d30-007c-2562-64715b2d0ea8",
        "detail-type": "UserSignUp",
        source: "my.event",
        account: "601427279990",
        time: "2022-01-24T16:00:10Z",
        region: "eu-west-1",
        resources: [],
        detail: {
          hello: "there",
          _datadog: {
            "x-datadog-trace-id": "5827606813695714842",
            "x-datadog-parent-id": "4726693487091824375",
            "x-datadog-sampling-priority": "1",
          },
        },
      };

      const extractor = new EventBridgeEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-trace-id": "5827606813695714842",
        "x-datadog-parent-id": "4726693487091824375",
        "x-datadog-sampling-priority": "1",
      });

      expect(traceContext?.toTraceId()).toBe("5827606813695714842");
      expect(traceContext?.toSpanId()).toBe("4726693487091824375");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it.each([
      ["detail", {}],
      ["_datadog in detail", { hello: "there" }],
    ])("returns null and skips extracting when payload is missing '%s'", (_, payload) => {
      const tracerWrapper = new TracerWrapper();
      const extractor = new EventBridgeEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload as any);
      expect(traceContext).toBeNull();
    });

    it("returns null when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper();

      const payload = {
        version: "0",
        id: "bd3c8258-8d30-007c-2562-64715b2d0ea8",
        "detail-type": "UserSignUp",
        source: "my.event",
        account: "601427279990",
        time: "2022-01-24T16:00:10Z",
        region: "eu-west-1",
        resources: [],
        detail: {
          hello: "there",
          _datadog: {},
        },
      };

      const extractor = new EventBridgeEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).toBeNull();
    });

    it("extracts trace context from Step Function EventBridge event", () => {
      // Reset StepFunctionContextService instance
      StepFunctionContextService["_instance"] = undefined as any;

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
          "arn:aws:states:us-east-2:123456123456:stateMachine:rstrat-sfn-evb-demo-dev-state-machine",
          "arn:aws:states:us-east-2:123456123456:execution:rstrat-sfn-evb-demo-dev-state-machine:6c190e7b-eb77-46db-af26-9066d353b105",
        ],
        detail: {
          message: "Event from Step Functions",
          timestamp: "2025-07-11T14:59:35.830Z",
          executionName: "6c190e7b-eb77-46db-af26-9066d353b105",
          stateMachineName: "rstrat-sfn-evb-demo-dev-state-machine",
          input: {
            testData: "Hello with Datadog tracing",
          },
          _datadog: {
            Execution: {
              Id: "arn:aws:states:us-east-2:123456123456:execution:rstrat-sfn-evb-demo-dev-state-machine:6c190e7b-eb77-46db-af26-9066d353b105",
              StartTime: "2025-07-11T14:59:35.806Z",
              Name: "6c190e7b-eb77-46db-af26-9066d353b105",
              RoleArn: "arn:aws:iam::123456123456:role/rstrat-sfn-evb-demo-dev-StepFunctionsExecutionRole-8maJHu01fhZZ",
              RedriveCount: 0,
            },
            StateMachine: {
              Id: "arn:aws:states:us-east-2:123456123456:stateMachine:rstrat-sfn-evb-demo-dev-state-machine",
              Name: "rstrat-sfn-evb-demo-dev-state-machine",
            },
            State: {
              Name: "PublishToEventBridge",
              EnteredTime: "2025-07-11T14:59:35.830Z",
              RetryCount: 0,
            },
            RootExecutionId:
              "arn:aws:states:us-east-2:123456123456:execution:rstrat-sfn-evb-demo-dev-state-machine:6c190e7b-eb77-46db-af26-9066d353b105",
            "serverless-version": "v1",
          },
        },
      };

      const extractor = new EventBridgeEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(traceContext?.toTraceId()).toBe("1503104665848096006");
      expect(traceContext?.toSpanId()).toBe("159267866761498620");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });
  });
});
