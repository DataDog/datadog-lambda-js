import http from "http";
import nock from "nock";

import { Context, Handler } from "aws-lambda";
import { datadog, getTraceHeaders, sendDistributionMetric, TraceHeaders } from "./index";
import { incrementErrorsMetric, incrementInvocationsMetric } from "./metrics/enhanced-metrics";
import { MetricsListener } from "./metrics/listener";
import { LogLevel, setLogLevel } from "./utils";

jest.mock("./metrics/enhanced-metrics");

const mockedIncrementErrors = incrementErrorsMetric as jest.Mock<typeof incrementErrorsMetric>;
const mockedIncrementInvocations = incrementInvocationsMetric as jest.Mock<typeof incrementInvocationsMetric>;

const mockARN = "arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda";
const mockContext = ({
  invokedFunctionArn: mockARN,
} as any) as Context;

// const MockedListener = OriginalListenerModule.MetricsListener as jest.Mocked<
//   typeof OriginalListenerModule.MetricsListener
// >;

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
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
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
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
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
      .post(`/api/v1/distribution_points?api_key=${apiKey}`, (request: any) => request.series[0].metric === "my-dist")
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
      .post(`/api/v1/distribution_points?api_key=${apiKey}`, (request: any) => request.series[0].metric === "my-dist")
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
      .post(`/api/v1/distribution_points?api_key=${apiKey}`, (request: any) => request.series[0].metric === "my-dist")
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

  it("makes the current trace headers available", async () => {
    let traceHeaders: Partial<TraceHeaders> = {};
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
    expect(mockedIncrementInvocations).toBeCalledWith(mockContext);

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

    expect(mockedIncrementInvocations).toBeCalledWith(mockContext);
    expect(mockedIncrementErrors).toBeCalledWith(mockContext);
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
});
