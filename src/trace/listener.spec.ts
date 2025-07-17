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
    mockSpanContextWrapper = {
      spanContext: mockSpanContext,
    };
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
    mockSpanContextWrapper = {
      spanContext: mockSpanContext,
    };

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
});
