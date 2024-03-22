import http from "http";
import nock from "nock";

import { Context, Handler } from "aws-lambda";
import { datadog, getTraceHeaders, sendDistributionMetric, sendDistributionMetricWithDate, _metricsQueue } from "./index";
import { incrementErrorsMetric, incrementInvocationsMetric } from "./metrics/enhanced-metrics";
import { LogLevel, setLogLevel } from "./utils";
import { HANDLER_STREAMING, STREAM_RESPONSE } from "./constants";
import { PassThrough } from "stream";
import { DatadogTraceHeaders } from "./trace/context/extractor";
import { SpanContextWrapper } from "./trace/span-context-wrapper";
import { TraceSource } from "./trace/trace-context-service";
import { inflateSync } from "zlib";

jest.mock("./metrics/enhanced-metrics");

const mockedIncrementErrors = incrementErrorsMetric as jest.Mock<typeof incrementErrorsMetric>;
const mockedIncrementInvocations = incrementInvocationsMetric as jest.Mock<typeof incrementInvocationsMetric>;

const mockARN = "arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda";
const mockContext = {
  invokedFunctionArn: mockARN,
} as any as Context;

// const MockedListener = OriginalListenerModule.MetricsListener as jest.Mocked<
//   typeof OriginalListenerModule.MetricsListener
// >;

let mockSpanContextWrapper: any;
let mockSpanContext: any;
let mockTraceHeaders: Record<string, string> | undefined = undefined;
let mockTraceSource: TraceSource | undefined = undefined;

jest.mock("./trace/trace-context-service", () => {
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

    get currentTraceHeaders() {
      return mockTraceHeaders;
    }
  }
  return {
    ...jest.requireActual("./trace/trace-context-service"),
    TraceContextService: MockTraceContextService,
  };
});

describe("datadog", () => {
  let traceId: string | undefined;
  let parentId: string | undefined;
  let sampled: string | undefined;
  let oldEnv: typeof process.env;

  const handler = (ev: any, context: any, callback: any) => {
    // Mocks out the call
    const req = http.get("http://www.example.com");
    traceId = req.getHeader("x-datadog-trace-id") as string;
    parentId = req.getHeader("x-datadog-parent-id") as string;
    sampled = req.getHeader("x-datadog-sampling-priority") as string;
    callback(null, "Result");
  };
  beforeEach(() => {
    mockTraceHeaders = undefined;
    mockSpanContext = undefined;
    mockSpanContextWrapper = undefined;
    traceId = undefined;
    parentId = undefined;
    sampled = undefined;
    setLogLevel(LogLevel.NONE);
    oldEnv = process.env;
    process.env = { ...oldEnv };
    nock.cleanAll();

    mockedIncrementErrors.mockClear();
    mockedIncrementInvocations.mockClear();
  });
  afterEach(() => {
    process.env = oldEnv;
  });

  it("patches http request when autoPatch enabled", async () => {
    nock("http://www.example.com").get("/").reply(200, {});
    mockTraceHeaders = {
      "x-datadog-parent-id": "9101112",
      "x-datadog-sampling-priority": "2",
      "x-datadog-trace-id": "123456",
    };

    const wrapped = datadog(handler, { forceWrap: true });
    await wrapped(
      {
        headers: {
          "x-datadog-parent-id": "9101112",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "123456",
        },
      },
      {} as any,
      async () => {
        return true;
      },
    );

    expect(traceId).toEqual("123456");
    expect(parentId).toEqual("9101112");
    expect(sampled).toEqual("2");
  });
  it("doesn't patch http requests when autoPatch is disabled", async () => {
    nock("http://www.example.com").get("/").reply(200, {});
    const wrapped = datadog(handler, { autoPatchHTTP: false, forceWrap: true });
    await wrapped(
      {
        headers: {
          "x-datadog-parent-id": "9101112",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "123456",
        },
      },
      {} as any,
      async () => {
        return true;
      },
    );

    expect(traceId).toBeUndefined();
    expect(parentId).toBeUndefined();
    expect(sampled).toBeUndefined();
  });

  it("reads API key from the environment for metrics", async () => {
    const apiKey = "123456";
    const apiKeyVar = "DD_API_KEY";
    process.env[apiKeyVar] = apiKey;

    nock("https://api.datadoghq.com")
      .post(
        `/api/v1/distribution_points?api_key=${apiKey}`,
        (request: any) =>
          JSON.parse(inflateSync(Buffer.from(request, "hex")).toString()).series[0].metric === "my-dist",
      )
      .reply(200, {});

    const wrapped = datadog(
      async () => {
        sendDistributionMetric("my-dist", 100, "first-tag", "second-tag");
        return "";
      },
      { forceWrap: true },
    );
    await wrapped({}, {} as any, () => {});

    expect(nock.isDone()).toBeTruthy();
  });

  it("prefers API key from the config object over the environment variable ", async () => {
    const envApiKey = "123456";
    const apiKeyVar = "DD_API_KEY";
    process.env[apiKeyVar] = envApiKey;
    const apiKey = "101112";

    nock("https://api.datadoghq.com")
      .post(
        `/api/v1/distribution_points?api_key=${apiKey}`,
        (request: any) =>
          JSON.parse(inflateSync(Buffer.from(request, "hex")).toString()).series[0].metric === "my-dist",
      )
      .reply(200, {});

    const wrapped = datadog(
      async () => {
        sendDistributionMetric("my-dist", 100, "first-tag", "second-tag");
        return "";
      },
      { apiKey, forceWrap: true },
    );
    await wrapped({}, {} as any, () => {});

    expect(nock.isDone()).toBeTruthy();
  });

  it("reads site keys from the environment", async () => {
    const site = "datadoghq.com";
    const siteEnvVar = "DD_SITE";
    const apiKey = "12345";
    process.env[siteEnvVar] = site;

    nock("https://api.datadoghq.com")
      .post(
        `/api/v1/distribution_points?api_key=${apiKey}`,
        (request: any) =>
          JSON.parse(inflateSync(Buffer.from(request, "hex")).toString()).series[0].metric === "my-dist",
      )
      .reply(200, {});

    const wrapped = datadog(
      async () => {
        sendDistributionMetric("my-dist", 100, "first-tag", "second-tag");
        return "";
      },
      { apiKey, forceWrap: true },
    );
    await wrapped({}, {} as any, () => {});

    expect(nock.isDone()).toBeTruthy();
  });

  it("reads site keys from the environment using custom timestamp", async () => {
    const site = "datadoghq.com";
    const siteEnvVar = "DD_SITE";
    const apiKey = "12345";
    process.env[siteEnvVar] = site;

    nock("https://api.datadoghq.com")
      .post(
        `/api/v1/distribution_points?api_key=${apiKey}`,
        (request: any) =>
          JSON.parse(inflateSync(Buffer.from(request, "hex")).toString()).series[0].metric === "my-dist",
      )
      .reply(200, {});

    const wrapped = datadog(
      async () => {
        sendDistributionMetricWithDate("my-dist", 100, new Date(), "first-tag", "second-tag");
        return "";
      },
      { apiKey, forceWrap: true },
    );
    await wrapped({}, {} as any, () => {});

    expect(nock.isDone()).toBeTruthy();
  });

  it("makes the current trace headers available", async () => {
    mockTraceHeaders = {
      "x-datadog-parent-id": "9101112",
      "x-datadog-sampling-priority": "2",
      "x-datadog-trace-id": "123456",
    };
    let traceHeaders: Partial<DatadogTraceHeaders> = {};
    const event = {
      headers: {
        "x-datadog-parent-id": "9101112",
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "123456",
      },
    };

    const wrapped = datadog(
      async () => {
        traceHeaders = getTraceHeaders();
        return "";
      },
      { forceWrap: true },
    );
    await wrapped(event, {} as any, () => {});
    expect(traceHeaders).toEqual({
      "x-datadog-parent-id": "9101112",
      "x-datadog-sampling-priority": "2",
      "x-datadog-trace-id": "123456",
    });
  });

  it("injects context into console.log messages", async () => {
    mockSpanContext = {
      toTraceId: () => "123456",
      toSpanId: () => "9101112",
      _sampling: {
        priority: "2",
      },
    };
    mockSpanContextWrapper = {
      spanContext: mockSpanContext,
      toTraceId: () => mockSpanContext.toTraceId(),
      toSpanId: () => mockSpanContext.toSpanId(),
    };

    const event = {
      headers: {
        "x-datadog-parent-id": "9101112",
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "123456",
      },
    };
    const spy = jest.spyOn(console, "log");

    const wrapped = datadog(
      async () => {
        console.log("Hello");
        return "";
      },
      { injectLogContext: true, forceWrap: true },
    );

    await wrapped(event, {} as any, () => {});
    expect(spy).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=9101112] Hello");
  });

  it("injects context into console.log messages with env var", async () => {
    process.env.DD_LOGS_INJECTION = "true";

    mockSpanContext = {
      toTraceId: () => "123456",
      toSpanId: () => "9101112",
      _sampling: {
        priority: "2",
      },
    };
    mockSpanContextWrapper = {
      spanContext: mockSpanContext,
      toTraceId: () => mockSpanContext.toTraceId(),
      toSpanId: () => mockSpanContext.toSpanId(),
    };

    const event = {
      headers: {
        "x-datadog-parent-id": "9101112",
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "123456",
      },
    };
    const spy = jest.spyOn(console, "log");

    const wrapped = datadog(
      async () => {
        console.log("Hello");
        return "";
      },
      { forceWrap: true },
    );

    await wrapped(event, {} as any, () => {});
    expect(spy).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=9101112] Hello");
  });

  it("increments invocations for each function call", async () => {
    const wrapped = datadog(handler, { forceWrap: true });

    await wrapped({}, mockContext, () => {});

    expect(mockedIncrementInvocations).toBeCalledTimes(1);
    expect(mockedIncrementInvocations).toBeCalledWith(expect.anything(), mockContext);

    await wrapped({}, mockContext, () => {});
    await wrapped({}, mockContext, () => {});
    await wrapped({}, mockContext, () => {});

    expect(mockedIncrementInvocations).toBeCalledTimes(4);
  });

  it("increments errors enhanced metric", async () => {
    const handlerError: Handler = (event, context, callback) => {
      throw Error("Some error");
    };

    const wrappedHandler = datadog(handlerError, { forceWrap: true });

    const result = wrappedHandler({}, mockContext, () => {});
    await expect(result).rejects.toEqual(Error("Some error"));

    expect(mockedIncrementInvocations).toBeCalledTimes(1);
    expect(mockedIncrementErrors).toBeCalledTimes(1);

    expect(mockedIncrementInvocations).toBeCalledWith(expect.anything(), mockContext);
    expect(mockedIncrementErrors).toBeCalledWith(expect.anything(), mockContext);
  });

  it("doesn't increment errors or invocations with config false setting", async () => {
    const handlerError: Handler = (event, context, callback) => {
      throw Error("Some error");
    };

    const wrappedHandler = datadog(handlerError, { enhancedMetrics: false, forceWrap: true });

    const result = wrappedHandler({}, mockContext, () => {});
    await expect(result).rejects.toEqual(Error("Some error"));

    expect(mockedIncrementInvocations).toBeCalledTimes(0);
    expect(mockedIncrementErrors).toBeCalledTimes(0);
  });

  it("doesn't increment enhanced metrics with env var set to false", async () => {
    process.env.DD_ENHANCED_METRICS = "false";

    const handlerError: Handler = (event, context, callback) => {
      throw Error("Some error");
    };

    const wrappedHandler = datadog(handlerError, { forceWrap: true });

    const result = wrappedHandler({}, mockContext, () => {});
    await expect(result).rejects.toEqual(Error("Some error"));

    expect(mockedIncrementInvocations).toBeCalledTimes(0);
    expect(mockedIncrementErrors).toBeCalledTimes(0);
  });

  it("use custom logger to log debug messages", async () => {
    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    const wrapped = datadog(handler, { forceWrap: true, logger: logger, debugLogging: true });

    await wrapped({}, mockContext, () => {});

    expect(mockedIncrementInvocations).toBeCalledTimes(1);
    expect(mockedIncrementInvocations).toBeCalledWith(expect.anything(), mockContext);
    expect(logger.debug).toHaveBeenCalledTimes(8);
    expect(logger.debug).toHaveBeenLastCalledWith('{"status":"debug","message":"datadog:Unpatching HTTP libraries"}');
  });

  it("adds stream symbol to function when handler is stream response type", async () => {
    const handler: any = async (event: any, responseStream: any, context: Context) => {};

    handler[HANDLER_STREAMING] = STREAM_RESPONSE;

    const wrapped = datadog(handler);
    const mockReadable = new PassThrough();
    await wrapped({}, mockReadable, mockContext);

    expect(wrapped[HANDLER_STREAMING]).toBe(STREAM_RESPONSE);
  });

  it("doesnt add stream symbol to function when handler is buffered type", async () => {
    const handler: any = async (event: any, context: Context) => {};

    const wrapped = datadog(handler);
    await wrapped({}, mockContext);

    expect(wrapped[HANDLER_STREAMING]).toBe(undefined);
  });
});


describe("sendDistributionMetric", () => {
  beforeEach(() => {
    _metricsQueue.reset()
    setLogLevel(LogLevel.NONE);
  })
  it("enqueues a metric for later processing when metrics listener is not initialized", () => {
    sendDistributionMetric("metric", 1, "first-tag", "second-tag");
    expect(_metricsQueue.length).toBe(1); 
  })
})

describe("sendDistributionMetricWithDate", () => {
  beforeEach(() => {
    _metricsQueue.reset()
    setLogLevel(LogLevel.NONE);
  })
  it("enqueues a metric for later processing when metrics listener is not initialized", () => {
    sendDistributionMetricWithDate("metric", 1, new Date(), "first-tag", "second-tag");
    expect(_metricsQueue.length).toBe(1); 
  })
})