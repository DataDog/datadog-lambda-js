import { TraceListener } from "./listener";
import { ddtraceVersion, parentSpanFinishTimeHeader } from "./constants";
import { datadogLambdaVersion } from "../constants";
import { Context } from "aws-lambda";
import { SpanWrapper } from "./span-wrapper";
import { TraceSource } from "./trace-context-service";
import { SpanContextWrapper } from "./span-context-wrapper";
import {
  DATADOG_PARENT_ID_HEADER,
  DATADOG_SAMPLING_PRIORITY_HEADER,
  DATADOG_TRACE_ID_HEADER,
} from "./context/extractor";

let mockWrap: jest.Mock<any, any>;
let mockExtract: jest.Mock<any, any>;
let mockSpanContextWrapper: any;
let mockSpanContext: any;
let mockTraceSource: TraceSource | undefined = undefined;

jest.mock("./tracer-wrapper", () => {
  mockWrap = jest.fn().mockImplementation((name, options, func) => func);
  mockExtract = jest.fn().mockImplementation((val) => val);
  class MockTraceWrapper {
    public isTracerAvailable = true;

    constructor() {}

    wrap(name: any, options: any, fn: any): any {
      return mockWrap(name, options, fn);
    }

    extract(event: any): any {
      return mockExtract(event);
    }

    startSpan(name: any, options: any): any {
      return {
        toSpanId: () => "mockSpanId",
        toTraceId: () => "mockTraceId",
        finish: jest.fn(),
        setTag: jest.fn(),
      };
    }

    injectSpan(span: any): any {
      return {
        [DATADOG_PARENT_ID_HEADER]: span.toSpanId(),
        [DATADOG_TRACE_ID_HEADER]: span.toTraceId(),
        [DATADOG_SAMPLING_PRIORITY_HEADER]: 1,
        [parentSpanFinishTimeHeader]: 1661189936981,
      };
    }
  }
  return {
    TracerWrapper: MockTraceWrapper,
  };
});

jest.mock("./trace-context-service", () => {
  class MockTraceContextService {
    extract(event: any, context: Context): SpanContextWrapper {
      return mockSpanContextWrapper;
    }

    get traceSource() {
      return mockTraceSource;
    }
    get currentTraceContext() {
      return mockSpanContextWrapper;
    }
  }
  return {
    ...jest.requireActual("./trace-context-service"),
    TraceContextService: MockTraceContextService,
  };
});

describe("TraceListener", () => {
  let oldEnv: any;
  const defaultConfig = {
    autoPatchHTTP: true,
    captureLambdaPayload: false,
    captureLambdaPayloadMaxDepth: 10,
    createInferredSpan: true,
    encodeAuthorizerContext: true,
    decodeAuthorizerContext: true,
    mergeDatadogXrayTraces: false,
    injectLogContext: false,
    minColdStartTraceDuration: 3,
    coldStartTraceSkipLib: "",
    addSpanPointers: true,
    useSpanLinks: false
  };
  const context = {
    invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
    awsRequestId: "1234",
    functionName: "my-Lambda",
  };
  const contextWithFunctionAlias = {
    ...context,
    invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda:alias",
  };
  const contextWithFunctionVersion = {
    ...context,
    invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda:1",
  };
  beforeEach(() => {
    mockWrap.mockClear();
    mockExtract.mockClear();
    mockSpanContext = undefined;
    mockSpanContextWrapper = undefined;
    mockTraceSource = undefined;
    oldEnv = process.env;
    process.env = { ...oldEnv };
    delete process.env.DD_SERVICE;
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  it("wraps dd-trace span around invocation", async () => {
    const listener = new TraceListener(defaultConfig);
    await listener.onStartInvocation({}, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "my-Lambda",
        tags: {
          cold_start: "true",
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "$LATEST",
          request_id: "1234",
          resource_names: "my-Lambda",
          functionname: "my-lambda",
          datadog_lambda: datadogLambdaVersion,
          dd_trace: ddtraceVersion,
        },
        type: "serverless",
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, with trace context from event", async () => {
    const listener = new TraceListener(defaultConfig);
    mockTraceSource = TraceSource.Event;
    mockSpanContext = {
      toTraceId: () => "4110911582297405551",
      toSpanId: () => "797643193680388251",
      _sampling: {
        priority: "2",
      },
    };
    mockSpanContextWrapper = [{
      spanContext: mockSpanContext,
    }];
    await listener.onStartInvocation({}, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "my-Lambda",
        tags: {
          cold_start: "true",
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "$LATEST",
          request_id: "1234",
          resource_names: "my-Lambda",
          functionname: "my-lambda",
          "_dd.parent_source": "event",
          datadog_lambda: datadogLambdaVersion,
          dd_trace: ddtraceVersion,
        },
        type: "serverless",
        childOf: mockSpanContext,
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, with linked trace context from event", async () => {
    const listener = new TraceListener({
      ...defaultConfig,
      useSpanLinks: true
    });
    mockTraceSource = TraceSource.Event;
    mockSpanContext = {
      toTraceId: () => "4110911582297405551",
      toSpanId: () => "797643193680388251",
      _sampling: {
        priority: "2",
      },
    };
    mockSpanContextWrapper = [{
      spanContext: mockSpanContext,
    }];
    await listener.onStartInvocation({}, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "my-Lambda",
        tags: {
          cold_start: "true",
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "$LATEST",
          request_id: "1234",
          resource_names: "my-Lambda",
          functionname: "my-lambda",
          "_dd.parent_source": "event",
          datadog_lambda: datadogLambdaVersion,
          dd_trace: ddtraceVersion,
        },
        type: "serverless",
        childOf: undefined,
        links: expect.arrayContaining([
          expect.objectContaining({
            context: mockSpanContext,
          }),
        ]),
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, without trace context from xray", async () => {
    const listener = new TraceListener(defaultConfig);
    mockTraceSource = TraceSource.Xray;

    await listener.onStartInvocation({}, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "my-Lambda",
        tags: {
          cold_start: "true",
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "$LATEST",
          request_id: "1234",
          resource_names: "my-Lambda",
          functionname: "my-lambda",
          datadog_lambda: datadogLambdaVersion,
          dd_trace: ddtraceVersion,
        },
        type: "serverless",
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, with trace context from xray when mergeDatadogXrayTraces is enabled", async () => {
    const listener = new TraceListener({ ...defaultConfig, mergeDatadogXrayTraces: true });
    mockTraceSource = TraceSource.Xray;
    mockSpanContext = {
      toTraceId: () => "4110911582297405551",
      toSpanId: () => "797643193680388251",
      _sampling: {
        priority: "2",
      },
    };
    mockSpanContextWrapper = [{
      spanContext: mockSpanContext,
    }];

    await listener.onStartInvocation({}, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "my-Lambda",
        tags: {
          cold_start: "true",
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "$LATEST",
          request_id: "1234",
          resource_names: "my-Lambda",
          functionname: "my-lambda",
          "_dd.parent_source": "xray",
          datadog_lambda: datadogLambdaVersion,
          dd_trace: ddtraceVersion,
        },
        type: "serverless",
        childOf: mockSpanContext,
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, with function alias", async () => {
    const listener = new TraceListener(defaultConfig);
    await listener.onStartInvocation({}, contextWithFunctionAlias as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "my-Lambda",
        tags: {
          cold_start: "true",
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "alias",
          request_id: "1234",
          resource_names: "my-Lambda",
          functionname: "my-lambda",
          datadog_lambda: datadogLambdaVersion,
          dd_trace: ddtraceVersion,
        },
        type: "serverless",
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, with function version", async () => {
    const listener = new TraceListener(defaultConfig);
    await listener.onStartInvocation({}, contextWithFunctionVersion as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "my-Lambda",
        tags: {
          cold_start: "true",
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "1",
          request_id: "1234",
          resource_names: "my-Lambda",
          functionname: "my-lambda",
          datadog_lambda: datadogLambdaVersion,
          dd_trace: ddtraceVersion,
        },
        type: "serverless",
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation with Step Function context", async () => {
    const listener = new TraceListener(defaultConfig);
    mockTraceSource = TraceSource.Event;

    // Mock Step Function context with deterministic trace IDs
    mockSpanContext = {
      toTraceId: () => "512d06a10e5e34cb", // Hex converted to decimal would be different
      toSpanId: () => "7069a031ef9ad2cc",
      _sampling: {
        priority: "1",
      },
    };
    mockSpanContextWrapper = [{
      spanContext: mockSpanContext,
    }];

    const stepFunctionSQSEvent = {
      Records: [
        {
          messageId: "4ead33f3-51c8-4094-87bd-5325dc143cbd",
          receiptHandle:
            "AQEBrGtLZCUS1POUEZtdZRoB0zXgT14OQC48A4Xk4Qbnv/v4d0ib5rFI1wEah823t2hE9haPm6nNN1aGsJmYkqa9Y8qaBQscp9f7HKJyybT5hpdKEn07fY0VRv/Of63u1RN1YdFdY5uhI8XGWRc4w7t62lQwMMFY5Ahy7XLVwnav81KRjGFdgxzITrtx3YKxmISNvXzPiiHNKb7jT+ClfXi91bEYHi3Od3ji5xGajAofgYrj2VBDULyohsfMkwlvAanD2wfj2x++wL5LSpFEtMFnvThzt7Dh5FEZChVMzWV+fRFpljivHX58ZeuGv4yIIjLVuuDGn5uAY5ES4CsdINrBAru6K5gDSPUajRzE3TktNgAq5Niqfky1x0srLRAJjTDdmZK8/CXU0sRT/MCT99vkCHa0bC17S/9au5bCbrB4k/T9J8W39AA6kIYhebkq3IQr",
          body: '{"testData":"Hello from Step Functions to SQS"}',
          attributes: {
            ApproximateReceiveCount: "1",
            SentTimestamp: "1752594520503",
            SenderId: "AROAWGCM4HXU73A4V34AJ:EcGTcmgJbwwOwXPbloVwgSaDOmwhYBLH",
            ApproximateFirstReceiveTimestamp: "1752594520516",
          },
          messageAttributes: {
            _datadog: {
              stringValue:
                '{"Execution":{"Id":"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-sqs-demo-dev-state-machine:a4912895-93a3-4803-a712-69fecb55c025","StartTime":"2025-07-15T15:48:40.302Z","Name":"a4912895-93a3-4803-a712-69fecb55c025","RoleArn":"arn:aws:iam::123456123456:role/rstrat-sfn-sqs-demo-dev-StepFunctionsExecutionRole-s6ozc2dVrvLH","RedriveCount":0},"StateMachine":{"Id":"arn:aws:states:sa-east-1:123456123456:stateMachine:rstrat-sfn-sqs-demo-dev-state-machine","Name":"rstrat-sfn-sqs-demo-dev-state-machine"},"State":{"Name":"SendToSQS","EnteredTime":"2025-07-15T15:48:40.333Z","RetryCount":0},"RootExecutionId":"arn:aws:states:sa-east-1:123456123456:execution:rstrat-sfn-sqs-demo-dev-state-machine:a4912895-93a3-4803-a712-69fecb55c025","serverless-version":"v1"}',
              stringListValues: [],
              binaryListValues: [],
              dataType: "String",
            },
          },
          md5OfMessageAttributes: "5469b8f90bb6ab27e95816c1fa178680",
          md5OfBody: "f0c0ddb2ed09a09e8791013f142e8d7e",
          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:sa-east-1:123456123456:rstrat-sfn-sqs-demo-dev-process-event-queue",
          awsRegion: "sa-east-1",
        },
      ],
    };

    await listener.onStartInvocation(stepFunctionSQSEvent, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "my-Lambda",
        tags: {
          cold_start: "true",
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "$LATEST",
          request_id: "1234",
          resource_names: "my-Lambda",
          functionname: "my-lambda",
          "_dd.parent_source": "event",
          "function_trigger.event_source": "sqs",
          "function_trigger.event_source_arn":
            "arn:aws:sqs:sa-east-1:123456123456:rstrat-sfn-sqs-demo-dev-process-event-queue",
          datadog_lambda: datadogLambdaVersion,
          dd_trace: ddtraceVersion,
        },
        type: "serverless",
        childOf: expect.objectContaining({
          toSpanId: expect.any(Function),
          toTraceId: expect.any(Function),
        }),
      },
      unwrappedFunc,
    );
  });

  it("injects authorizer context if it exists", async () => {
    const listener = new TraceListener(defaultConfig);
    mockTraceSource = TraceSource.Event;
    const inferredSpan = new SpanWrapper(
      {
        toSpanId: () => {
          return "797643193680388251";
        },
        toTraceId: () => {
          return "4110911582297405551";
        },
      },
      { isAsync: true },
    );
    (listener as any).wrappedCurrentSpan = {
      startTime: () => {
        return 1661189936981;
      },
    } as any;

    (listener as any).inferredSpan = inferredSpan;

    const result: any = {};
    listener.injectAuthorizerSpan(result, "randomId", 1661189936981);

    expect(result.context._datadog).toBe(
      "eyJ4LWRhdGFkb2ctcGFyZW50LWlkIjoiNzk3NjQzMTkzNjgwMzg4MjUxIiwieC1kYXRhZG9nLXRyYWNlLWlkIjoiNDExMDkxMTU4MjI5NzQwNTU1MSIsIngtZGF0YWRvZy1zYW1wbGluZy1wcmlvcml0eSI6MSwieC1kYXRhZG9nLXBhcmVudC1zcGFuLWZpbmlzaC10aW1lIjoxNjYxMTg5OTM2OTgxMDAwMDAwLCJ4LWRhdGFkb2ctYXV0aG9yaXppbmctcmVxdWVzdGlkIjoicmFuZG9tSWQifQ==",
    );
  });
  it("sets service name from DD_SERVICE environment variable", async () => {
    process.env.DD_SERVICE = "my-custom-service";
    const listener = new TraceListener(defaultConfig);
    await listener.onStartInvocation({}, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "my-custom-service",
        tags: {
          cold_start: "true",
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "$LATEST",
          request_id: "1234",
          resource_names: "my-Lambda",
          functionname: "my-lambda",
          datadog_lambda: datadogLambdaVersion,
          dd_trace: ddtraceVersion,
        },
        type: "serverless",
      },
      unwrappedFunc,
    );
  });

  describe("DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED tests for aws.lambda service name", () => {
    const lambdaContext = {
      invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
      awsRequestId: "1234",
      functionName: "my-Lambda",
    };

    beforeEach(() => {
      mockWrap.mockClear();
      mockExtract.mockClear();
      mockSpanContext = undefined;
      mockSpanContextWrapper = undefined;
      mockTraceSource = undefined;
      process.env = { ...oldEnv }; // Restore original environment variables
      delete process.env.DD_SERVICE; // Ensure DD_SERVICE doesn't interfere
      delete process.env.DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED;
    });

    afterEach(() => {
      process.env = oldEnv;
    });

    it("uses 'aws.lambda' when DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED is 'false'", async () => {
      process.env.DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED = "false";
      const listener = new TraceListener(defaultConfig);
      await listener.onStartInvocation({}, lambdaContext as any);
      const unwrappedFunc = () => {};
      const wrappedFunc = listener.onWrap(unwrappedFunc);
      wrappedFunc();
      await listener.onCompleteInvocation();

      expect(mockWrap).toHaveBeenCalledWith(
        "aws.lambda",
        expect.objectContaining({
          service: "aws.lambda",
        }),
        unwrappedFunc,
      );
    });

    it("uses 'aws.lambda' when DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED is '0'", async () => {
      process.env.DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED = "0";
      const listener = new TraceListener(defaultConfig);
      await listener.onStartInvocation({}, lambdaContext as any);
      const unwrappedFunc = () => {};
      const wrappedFunc = listener.onWrap(unwrappedFunc);
      wrappedFunc();
      await listener.onCompleteInvocation();

      expect(mockWrap).toHaveBeenCalledWith(
        "aws.lambda",
        expect.objectContaining({
          service: "aws.lambda",
        }),
        unwrappedFunc,
      );
    });

    it("uses function name when DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED is not set", async () => {
      delete process.env.DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED;
      const listener = new TraceListener(defaultConfig);
      await listener.onStartInvocation({}, lambdaContext as any);
      const unwrappedFunc = () => {};
      const wrappedFunc = listener.onWrap(unwrappedFunc);
      wrappedFunc();
      await listener.onCompleteInvocation();

      expect(mockWrap).toHaveBeenCalledWith(
        "aws.lambda",
        expect.objectContaining({
          service: lambdaContext.functionName,
        }),
        unwrappedFunc,
      );
    });

    it("uses function name when DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED is 'true'", async () => {
      process.env.DD_TRACE_AWS_SERVICE_REPRESENTATION_ENABLED = "true";
      const listener = new TraceListener(defaultConfig);
      await listener.onStartInvocation({}, lambdaContext as any);
      const unwrappedFunc = () => {};
      const wrappedFunc = listener.onWrap(unwrappedFunc);
      wrappedFunc();
      await listener.onCompleteInvocation();

      expect(mockWrap).toHaveBeenCalledWith(
        "aws.lambda",
        expect.objectContaining({
          service: lambdaContext.functionName,
        }),
        unwrappedFunc,
      );
    });
  });
});
