import { TraceExtractor, TraceListener } from "./listener";
import {
  Source,
  ddtraceVersion,
  parentIDHeader,
  traceIDHeader,
  samplingPriorityHeader,
  parentSpanFinishTimeHeader,
} from "./constants";
import { datadogLambdaVersion } from "../constants";
import { Context } from "aws-lambda";
import { TraceHeaders } from "./trace-context-service";
import { SpanWrapper } from "./span-wrapper";
import { eventSubTypes } from "./trigger";

let mockWrap: jest.Mock<any, any>;
let mockExtract: jest.Mock<any, any>;
let mockTraceHeaders: Record<string, string> | undefined = undefined;
let mockTraceSource: Source | undefined = undefined;

jest.mock("./tracer-wrapper", () => {
  mockWrap = jest.fn().mockImplementation((name, options, func) => func);
  mockExtract = jest.fn().mockImplementation((val) => val);
  class MockTraceWrapper {
    get isTraceAvailable() {
      return true;
    }

    constructor() {}

    wrap(name: any, options: any, fn: any): any {
      return mockWrap(name, options, fn);
    }

    extract(event: any): any {
      return mockExtract(event);
    }

    injectSpan(span: any): any {
      return {
        [parentIDHeader]: span.toSpanId(),
        [traceIDHeader]: span.toTraceId(),
        [samplingPriorityHeader]: 1,
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
    extractHeadersFromContext(
      event: any,
      context: Context,
      extractor?: TraceExtractor,
    ): Partial<TraceHeaders> | undefined {
      return mockTraceHeaders;
    }

    get traceSource() {
      return mockTraceSource;
    }
    get rootTraceHeaders() {
      return mockTraceHeaders;
    }
  }
  return {
    TraceContextService: MockTraceContextService,
  };
});

describe("TraceListener", () => {
  const defaultConfig = {
    autoPatchHTTP: true,
    captureLambdaPayload: false,
    createInferredSpan: true,
    encodeAuthorizerContext: true,
    decodeAuthorizerContext: true,
    mergeDatadogXrayTraces: false,
    injectLogContext: false,
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
    mockTraceHeaders = undefined;
    mockTraceSource = undefined;
  });

  it("wraps dd-trace span around invocation", async () => {
    const listener = new TraceListener(defaultConfig);
    listener.onStartInvocation({}, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
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
    mockTraceHeaders = {
      "x-datadog-parent-id": "797643193680388251",
      "x-datadog-sampling-priority": "2",
      "x-datadog-trace-id": "4110911582297405551",
    };
    mockTraceSource = Source.Event;
    listener.onStartInvocation({}, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
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
        childOf: mockTraceHeaders,
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, without trace context from xray", async () => {
    const listener = new TraceListener(defaultConfig);
    mockTraceHeaders = {
      "x-datadog-parent-id": "797643193680388251",
      "x-datadog-sampling-priority": "2",
      "x-datadog-trace-id": "4110911582297405551",
    };
    mockTraceSource = Source.Xray;

    listener.onStartInvocation({}, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
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
    mockTraceHeaders = {
      "x-datadog-parent-id": "797643193680388251",
      "x-datadog-sampling-priority": "2",
      "x-datadog-trace-id": "4110911582297405551",
    };
    mockTraceSource = Source.Xray;

    listener.onStartInvocation({}, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
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
        childOf: mockTraceHeaders,
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, with function alias", async () => {
    const listener = new TraceListener(defaultConfig);
    listener.onStartInvocation({}, contextWithFunctionAlias as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
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
    listener.onStartInvocation({}, contextWithFunctionVersion as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-Lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
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
    mockTraceHeaders = {
      "x-datadog-parent-id": "797643193680388251",
      "x-datadog-sampling-priority": "2",
      "x-datadog-trace-id": "4110911582297405551",
      "x-datadog-parent-span-finish-time": "1661189936981",
    };
    mockTraceSource = Source.Event;
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
});
