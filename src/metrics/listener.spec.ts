import { AWSError, KMS, Request } from "aws-sdk";
import nock from "nock";
import mock from "mock-fs";

import { LogLevel, setLogLevel } from "../utils";
import { AGENT_URL } from "./extension";

import { MetricsListener } from "./listener";
import StatsDClient from "hot-shots";
jest.mock("hot-shots");

const siteURL = "example.com";

class MockKMS {
  constructor(public value: string, public error?: Error) {}

  public decrypt(_: string): Promise<string> {
    return this.error ? Promise.reject(this.error) : Promise.resolve(this.value);
  }
}

setLogLevel(LogLevel.NONE);

describe("MetricsListener", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses unencrypted api key by default", async () => {
    nock("https://api.example.com").post("/api/v1/distribution_points?api_key=api-key").reply(200, {});

    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "api-key",
      apiKeyKMS: "kms-api-key-encrypted",
      enhancedMetrics: false,
      logForwarding: false,
      shouldRetryMetrics: false,
      siteURL,
    });

    await listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, false, "tag:a", "tag:b");
    await listener.onCompleteInvocation();

    expect(nock.isDone()).toBeTruthy();
  });
  it("uses encrypted kms key if it's the only value available", async () => {
    nock("https://api.example.com").post("/api/v1/distribution_points?api_key=kms-api-key-decrypted").reply(200, {});

    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "",
      apiKeyKMS: "kms-api-key-encrypted",
      enhancedMetrics: false,
      logForwarding: false,
      shouldRetryMetrics: false,
      siteURL,
    });

    await listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, false, "tag:a", "tag:b");
    await listener.onCompleteInvocation();

    expect(nock.isDone()).toBeTruthy();
  });
  it("doesn't throw an error if it can't get a valid apiKey", async () => {
    const kms = new MockKMS("kms-api-key-decrypted", new Error("The error"));
    const listener = new MetricsListener(kms as any, {
      apiKey: "",
      apiKeyKMS: "kms-api-key-encrypted",
      enhancedMetrics: false,
      logForwarding: false,
      shouldRetryMetrics: false,
      siteURL,
    });

    listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, false, "tag:a", "tag:b");
    await expect(listener.onCompleteInvocation()).resolves.toEqual(undefined);
  });

  it("logs metrics when logForwarding is enabled", async () => {
    const spy = jest.spyOn(process.stdout, "write");
    jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);
    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "api-key",
      apiKeyKMS: "kms-api-key-encrypted",
      enhancedMetrics: false,
      logForwarding: true,
      shouldRetryMetrics: false,
      siteURL,
    });
    jest.useFakeTimers();

    listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, false, "tag:a", "tag:b");
    await listener.onCompleteInvocation();

    expect(spy).toHaveBeenCalledWith(`{"e":1487076708,"m":"my-metric","t":["tag:a","tag:b"],"v":10}\n`);
  });
  it("always sends metrics to statsD when extension is enabled, ignoring logForwarding=true", async () => {
    const helloScope = nock(AGENT_URL).get("/lambda/hello").reply(200);
    const flushScope = nock(AGENT_URL).post("/lambda/flush", JSON.stringify({})).reply(200);
    mock({
      "/opt/extensions/datadog-agent": Buffer.from([0]),
    });
    const distributionMock = jest.fn();
    (StatsDClient as any).mockImplementation(() => {
      return {
        distribution: distributionMock,
        close: (callback: any) => callback(undefined),
      };
    });

    jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);

    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "api-key",
      apiKeyKMS: "",
      enhancedMetrics: false,
      logForwarding: true,
      shouldRetryMetrics: false,
      siteURL,
    });
    jest.useFakeTimers();

    await listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, false, "tag:a", "tag:b");
    await listener.onCompleteInvocation();
    expect(helloScope.isDone()).toBeTruthy();
    expect(flushScope.isDone()).toBeTruthy();
    expect(distributionMock).toHaveBeenCalledWith("my-metric", 10, undefined, ["tag:a", "tag:b"]);
  });

  it("logs metrics when logForwarding is enabled with custom timestamp", async () => {
    const spy = jest.spyOn(process.stdout, "write");
    // jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);
    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "api-key",
      apiKeyKMS: "kms-api-key-encrypted",
      enhancedMetrics: false,
      logForwarding: true,
      shouldRetryMetrics: false,
      siteURL,
    });
    // jest.useFakeTimers();

    listener.onStartInvocation({});
    listener.sendDistributionMetricWithDate("my-metric", 10, new Date(1584983836 * 1000), false, "tag:a", "tag:b");
    await listener.onCompleteInvocation();

    expect(spy).toHaveBeenCalledWith(`{"e":1584983836,"m":"my-metric","t":["tag:a","tag:b"],"v":10}\n`);
  });
});
