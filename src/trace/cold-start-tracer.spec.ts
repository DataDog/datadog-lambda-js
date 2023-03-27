import { RequireNode } from "../runtime/require-tracer";
import { ColdStartTracerConfig, ColdStartTracer } from "./cold-start-tracer";
import { TracerWrapper, SpanOptions } from "./tracer-wrapper";
import { SpanWrapper } from "./span-wrapper";

let mockStartSpan: jest.Mock<any, any>;
let mockFinishSpan: jest.Mock<any, any>;

jest.mock("./tracer-wrapper", () => {
  mockFinishSpan = jest.fn();
  mockStartSpan = jest.fn().mockImplementation((spanName, spanOptions) => {
    return { spanName, spanOptions, finish: mockFinishSpan };
  });
  class MockTraceWrapper {
    get isTraceAvailable() {
      return true;
    }

    constructor() {}

    startSpan(spanName: string, spanOptions: SpanOptions): any {
      return mockStartSpan(spanName, spanOptions);
    }
  }
  return {
    TracerWrapper: MockTraceWrapper,
  };
});

describe("ColdStartTracer", () => {
  beforeEach(() => {
    mockStartSpan.mockClear();
    mockFinishSpan.mockClear();
  });

  it("generates a trace tree", () => {
    const requireNodes: RequireNode[] = [
      {
        id: "handler",
        filename: "/var/task/handler.js",
        startTime: 1,
        endTime: 6,
        children: [
          {
            id: "myChildModule",
            filename: "/opt/nodejs/node_modules/my-child-module.js",
            startTime: 2,
            endTime: 3,
          },
          {
            id: "myCoreModule",
            filename: "http",
            startTime: 4,
            endTime: 5,
          },
          {
            id: "aws-sdk",
            filename: "/var/runtime/aws-sdk",
            startTime: 4,
            endTime: 5,
          },
        ],
      } as any as RequireNode,
    ];
    const coldStartConfig: ColdStartTracerConfig = {
      tracerWrapper: new TracerWrapper(),
      parentSpan: {
        span: {},
        name: "my-lambda-span",
      } as any as SpanWrapper,
      lambdaFunctionName: "my-function-name",
      minDuration: 1,
      ignoreLibs: "",
    };
    const coldStartTracer = new ColdStartTracer(coldStartConfig);
    coldStartTracer.trace(requireNodes);
    expect(mockStartSpan).toHaveBeenCalledTimes(5);
    expect(mockFinishSpan).toHaveBeenCalledTimes(5);
    const span1 = mockStartSpan.mock.calls[0];
    expect(span1[0]).toEqual("aws.lambda.load");
    expect(span1[1].tags).toEqual({
      operation_name: "aws.lambda.require",
      "resource.name": "my-function-name",
      resource_names: "my-function-name",
      service: "aws.lambda",
    });
    const span2 = mockStartSpan.mock.calls[1];
    expect(span2[0]).toEqual("aws.lambda.require");
    expect(span2[1].tags).toEqual({
      operation_name: "aws.lambda.require",
      "resource.name": "handler",
      resource_names: "handler",
      service: "aws.lambda",
      filename: "/var/task/handler.js",
    });
    const span3 = mockStartSpan.mock.calls[2];
    expect(span3[0]).toEqual("aws.lambda.require_layer");
    expect(span3[1].tags).toEqual({
      filename: "/opt/nodejs/node_modules/my-child-module.js",
      operation_name: "aws.lambda.require_layer",
      "resource.name": "myChildModule",
      resource_names: "myChildModule",
      service: "aws.lambda",
    });
    const span4 = mockStartSpan.mock.calls[3];
    expect(span4[0]).toEqual("aws.lambda.require_core_module");
    expect(span4[1].tags).toEqual({
      filename: "http",
      operation_name: "aws.lambda.require_core_module",
      "resource.name": "myCoreModule",
      resource_names: "myCoreModule",
      service: "aws.lambda",
    });
    const span5 = mockStartSpan.mock.calls[4];
    expect(span5[0]).toEqual("aws.lambda.require_runtime");
    expect(span5[1].tags).toEqual({
      filename: "/var/runtime/aws-sdk",
      operation_name: "aws.lambda.require_runtime",
      "resource.name": "aws-sdk",
      resource_names: "aws-sdk",
      service: "aws.lambda",
    });
  });

  it("optionally skips libraries", () => {
    const requireNodes: RequireNode[] = [
      {
        id: "handler",
        filename: "/var/task/handler.js",
        startTime: 1,
        endTime: 6,
        children: [
          {
            id: "myChildModule",
            filename: "/opt/nodejs/node_modules/my-child-module.js",
            startTime: 2,
            endTime: 3,
          },
          {
            id: "myCoreModule",
            filename: "http",
            startTime: 4,
            endTime: 5,
          },
          {
            id: "aws-sdk",
            filename: "/var/runtime/aws-sdk",
            startTime: 4,
            endTime: 5,
          },
        ],
      } as any as RequireNode,
    ];
    const coldStartConfig: ColdStartTracerConfig = {
      tracerWrapper: new TracerWrapper(),
      parentSpan: {
        span: {},
        name: "my-lambda-span",
      } as any as SpanWrapper,
      lambdaFunctionName: "my-function-name",
      minDuration: 1,
      ignoreLibs: "myChildModule,myCoreModule",
    };
    const coldStartTracer = new ColdStartTracer(coldStartConfig);
    coldStartTracer.trace(requireNodes);
    expect(mockStartSpan).toHaveBeenCalledTimes(3);
    expect(mockFinishSpan).toHaveBeenCalledTimes(3);
    const span1 = mockStartSpan.mock.calls[0];
    expect(span1[0]).toEqual("aws.lambda.load");
    expect(span1[1].tags).toEqual({
      operation_name: "aws.lambda.require",
      "resource.name": "my-function-name",
      resource_names: "my-function-name",
      service: "aws.lambda",
    });
    const span2 = mockStartSpan.mock.calls[1];
    expect(span2[0]).toEqual("aws.lambda.require");
    expect(span2[1].tags).toEqual({
      operation_name: "aws.lambda.require",
      "resource.name": "handler",
      resource_names: "handler",
      service: "aws.lambda",
      filename: "/var/task/handler.js",
    });
    const span3 = mockStartSpan.mock.calls[2];
    expect(span3[0]).toEqual("aws.lambda.require_runtime");
    expect(span3[1].tags).toEqual({
      filename: "/var/runtime/aws-sdk",
      operation_name: "aws.lambda.require_runtime",
      "resource.name": "aws-sdk",
      resource_names: "aws-sdk",
      service: "aws.lambda",
    });
  });
});
