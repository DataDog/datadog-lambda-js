import { TraceListener } from "./listener";
import { Source } from "./constants";

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
  }
  return {
    TracerWrapper: MockTraceWrapper,
  };
});

jest.mock("./trace-context-service", () => {
  class MockTraceContextService {
    get traceSource() {
      return mockTraceSource;
    }
    get currentTraceHeaders() {
      return mockTraceHeaders;
    }
  }
  return {
    TraceContextService: MockTraceContextService,
  };
});

describe("TraceListener", () => {
  const defaultConfig = { autoPatchHTTP: true, mergeDatadogXrayTraces: false, injectLogContext: false };
  const context = {
    invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
    awsRequestId: "1234",
    functionName: "my-lambda",
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
    const listener = new TraceListener(defaultConfig, "handler.my-handler");
    listener.onStartInvocation({}, context as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "$LATEST",
          request_id: "1234",
          resource_names: "my-lambda",
        },
        type: "serverless",
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, with trace context from event", async () => {
    const listener = new TraceListener(defaultConfig, "handler.my-handler");
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
        resource: "my-lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "$LATEST",
          request_id: "1234",
          resource_names: "my-lambda",
          "_dd.parent_source": "event",
        },
        type: "serverless",
        childOf: mockTraceHeaders,
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, without trace context from xray", async () => {
    const listener = new TraceListener(defaultConfig, "handler.my-handler");
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
        resource: "my-lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "$LATEST",
          request_id: "1234",
          resource_names: "my-lambda",
        },
        type: "serverless",
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, with trace context from xray when mergeDatadogXrayTraces is enabled", async () => {
    const listener = new TraceListener({ ...defaultConfig, mergeDatadogXrayTraces: true }, "handler.my-handler");
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
        resource: "my-lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "$LATEST",
          request_id: "1234",
          resource_names: "my-lambda",
          "_dd.parent_source": "xray",
        },
        type: "serverless",
        childOf: mockTraceHeaders,
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, with function alias", async () => {
    const listener = new TraceListener(defaultConfig, "handler.my-handler");
    listener.onStartInvocation({}, contextWithFunctionAlias as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "alias",
          request_id: "1234",
          resource_names: "my-lambda",
        },
        type: "serverless",
      },
      unwrappedFunc,
    );
  });

  it("wraps dd-trace span around invocation, with function version", async () => {
    const listener = new TraceListener(defaultConfig, "handler.my-handler");
    listener.onStartInvocation({}, contextWithFunctionVersion as any);
    const unwrappedFunc = () => {};
    const wrappedFunc = listener.onWrap(unwrappedFunc);
    wrappedFunc();
    await listener.onCompleteInvocation();

    expect(mockWrap).toHaveBeenCalledWith(
      "aws.lambda",
      {
        resource: "my-lambda",
        service: "aws.lambda",
        tags: {
          cold_start: true,
          function_arn: "arn:aws:lambda:us-east-1:123456789101:function:my-lambda",
          function_version: "1",
          request_id: "1234",
          resource_names: "my-lambda",
        },
        type: "serverless",
      },
      unwrappedFunc,
    );
  });
});
