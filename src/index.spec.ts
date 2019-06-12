import http from "http";
import nock from "nock";

import { datadog, sendDistributionMetric } from "./index";
import { unpatchHttp } from "./trace/patch-http";
import { setErrorLoggingEnabled } from "./utils";

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
    setErrorLoggingEnabled(false);
    oldEnv = process.env;
    process.env = { ...oldEnv };
    nock.cleanAll();
  });
  afterEach(() => {
    process.env = oldEnv;
  });

  it("patches http request when autoPatch enabled", (done) => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
    const wrapped = datadog(handler);
    wrapped(
      {
        headers: {
          "x-datadog-parent-id": "9101112",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "123456",
        },
      },
      {} as any,
      () => {
        done();
      },
    );

    expect(traceId).toEqual("123456");
    expect(parentId).toEqual("9101112");
    expect(sampled).toEqual("2");
  });
  it("doesn't patch http request when autoPatch is disabled", (done) => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
    const wrapped = datadog(handler, { autoPatchHTTP: false });
    wrapped(
      {
        headers: {
          "x-datadog-parent-id": "9101112",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "123456",
        },
      },
      {} as any,
      () => {
        done();
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
      .post(`/v1/series?api_key=${apiKey}`, (request: any) => request.series[0].metric === "my-dist")
      .reply(200, {});

    const wrapped = datadog(async () => {
      sendDistributionMetric("my-dist", 100, "first-tag", "second-tag");
      return "";
    });
    await wrapped({}, {} as any, () => {});

    expect(nock.isDone()).toBeTruthy();
  });

  it("prefers API key from the config object over the environment variable ", async () => {
    const envApiKey = "123456";
    const apiKeyVar = "DD_API_KEY";
    process.env[apiKeyVar] = envApiKey;
    const apiKey = "101112";

    nock("https://api.datadoghq.com")
      .post(`/v1/series?api_key=${apiKey}`, (request: any) => request.series[0].metric === "my-dist")
      .reply(200, {});

    const wrapped = datadog(
      async () => {
        sendDistributionMetric("my-dist", 100, "first-tag", "second-tag");
        return "";
      },
      { apiKey },
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
      .post(`/v1/series?api_key=${apiKey}`, (request: any) => request.series[0].metric === "my-dist")
      .reply(200, {});

    const wrapped = datadog(
      async () => {
        sendDistributionMetric("my-dist", 100, "first-tag", "second-tag");
        return "";
      },
      { apiKey },
    );
    await wrapped({}, {} as any, () => {});

    expect(nock.isDone()).toBeTruthy();
  });
});
