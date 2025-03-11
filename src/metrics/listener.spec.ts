import nock from "nock";
import mock from "mock-fs";

import { LogLevel, setLogLevel } from "../utils";
import { EXTENSION_URL } from "./extension";

import { MetricsListener } from "./listener";
import StatsDClient from "hot-shots";
import { Context } from "aws-lambda";
jest.mock("hot-shots");

jest.mock("@aws-sdk/client-secrets-manager", () => {
  return {
    SecretsManager: jest.fn().mockImplementation(() => ({
      getSecretValue: jest.fn().mockResolvedValue({ SecretString: "api-key-secret" }),
    })),
  };
});

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
    mock.restore();
  });

  it("uses unencrypted api key by default", async () => {
    nock("https://api.example.com").post("/api/v1/distribution_points?api_key=api-key").reply(200, {});

    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "api-key",
      apiKeyKMS: "kms-api-key-encrypted",
      apiKeySecretARN: "api-key-secret-arn",
      enhancedMetrics: false,
      logForwarding: false,
      shouldRetryMetrics: false,
      localTesting: false,
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
      apiKeySecretARN: "api-key-secret-arn",
      enhancedMetrics: false,
      logForwarding: false,
      shouldRetryMetrics: false,
      localTesting: false,
      siteURL,
    });

    await listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, false, "tag:a", "tag:b");
    await listener.onCompleteInvocation();

    expect(nock.isDone()).toBeTruthy();
  });

  it("extracts the API Key from the secret manager to send a metric", async () => {
    nock("https://api.example.com").post("/api/v1/distribution_points?api_key=api-key-secret").reply(200, {});

    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "",
      apiKeyKMS: "",
      apiKeySecretARN: "api-key-secret-arn",
      enhancedMetrics: false,
      logForwarding: false,
      shouldRetryMetrics: false,
      localTesting: false,
      siteURL,
    });

    await listener.onStartInvocation({});
    listener.sendDistributionMetricWithDate("my-metric", 10, new Date(), false, "tag:a", "tag:b");
    await listener.onCompleteInvocation();

    expect(nock.isDone()).toBeTruthy();
  });

  it("doesn't throw an error if it can't get a valid apiKey", async () => {
    const kms = new MockKMS("kms-api-key-decrypted", new Error("The error"));
    const listener = new MetricsListener(kms as any, {
      apiKey: "",
      apiKeyKMS: "kms-api-key-encrypted",
      apiKeySecretARN: "api-key-secret-arn",
      enhancedMetrics: false,
      logForwarding: false,
      shouldRetryMetrics: false,
      localTesting: false,
      siteURL,
    });

    await listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, false, "tag:a", "tag:b");
    await expect(listener.onCompleteInvocation()).resolves.toEqual(undefined);
  });

  it("configures FIPS endpoint for GovCloud regions", async () => {
    try {
      process.env.AWS_REGION = "us-gov-west-1";
      const secretsManagerModule = require("@aws-sdk/client-secrets-manager");
      const secretsManagerSpy = jest.spyOn(secretsManagerModule, "SecretsManager");

      const kms = new MockKMS("kms-api-key-decrypted");
      const listener = new MetricsListener(kms as any, {
        apiKey: "",
        apiKeyKMS: "",
        apiKeySecretARN: "api-key-secret-arn",
        enhancedMetrics: false,
        logForwarding: false,
        shouldRetryMetrics: false,
        localTesting: false,
        siteURL,
      });

      await listener.onStartInvocation({});
      await listener.onCompleteInvocation();

      expect(secretsManagerSpy).toHaveBeenCalledWith({
        useFipsEndpoint: true,
      });

      secretsManagerSpy.mockRestore();
    } finally {
      process.env.AWS_REGION = "us-east-1";
    }
  });

  it("logs metrics when logForwarding is enabled", async () => {
    const spy = jest.spyOn(process.stdout, "write");
    jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);
    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "api-key",
      apiKeyKMS: "kms-api-key-encrypted",
      apiKeySecretARN: "api-key-secret-arn",
      enhancedMetrics: false,
      logForwarding: true,
      shouldRetryMetrics: false,
      localTesting: false,
      siteURL,
    });
    jest.useFakeTimers("legacy");

    listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, false, "tag:a", "tag:b");
    await listener.onCompleteInvocation();

    expect(spy).toHaveBeenCalledWith(`{"e":1487076708,"m":"my-metric","t":["tag:a","tag:b"],"v":10}\n`);
  });
  it("always sends metrics to statsD when extension is enabled, ignoring logForwarding=true", async () => {
    const flushScope = nock(EXTENSION_URL).post("/lambda/flush", JSON.stringify({})).reply(200);
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
      apiKeySecretARN: "api-key-secret-arn",
      enhancedMetrics: false,
      logForwarding: true,
      shouldRetryMetrics: false,
      localTesting: true,
      siteURL,
    });
    jest.useFakeTimers("legacy");

    await listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, false, "tag:a", "tag:b");
    await listener.onCompleteInvocation();
    expect(flushScope.isDone()).toBeTruthy();
    expect(distributionMock).toHaveBeenCalledWith("my-metric", 10, undefined, ["tag:a", "tag:b"]);
  });

  it("only sends metrics with timestamps to the API when the extension is enabled", async () => {
    const flushScope = nock(EXTENSION_URL).post("/lambda/flush", JSON.stringify({})).reply(200);
    mock({
      "/opt/extensions/datadog-agent": Buffer.from([0]),
    });
    const apiScope = nock("https://api.example.com").post("/api/v1/distribution_points?api_key=api-key").reply(200, {});

    const distributionMock = jest.fn();
    (StatsDClient as any).mockImplementation(() => {
      return {
        distribution: distributionMock,
        close: (callback: any) => callback(undefined),
      };
    });

    const metricTimeOneMinuteAgo = new Date(Date.now() - 60000);
    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "api-key",
      apiKeyKMS: "",
      apiKeySecretARN: "api-key-secret-arn",
      enhancedMetrics: false,
      logForwarding: false,
      shouldRetryMetrics: false,
      localTesting: true,
      siteURL,
    });
    const mockARN = "arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda";
    const mockContext = {
      invokedFunctionArn: mockARN,
    } as any as Context;

    await listener.onStartInvocation({}, mockContext);
    listener.sendDistributionMetricWithDate(
      "my-metric-with-a-timestamp",
      10,
      metricTimeOneMinuteAgo,
      false,
      "tag:a",
      "tag:b",
    );
    listener.sendDistributionMetric("my-metric-without-a-timestamp", 10, false, "tag:a", "tag:b");
    await listener.onCompleteInvocation();

    expect(flushScope.isDone()).toBeTruthy();
    expect(apiScope.isDone()).toBeTruthy();
    expect(distributionMock).toHaveBeenCalledWith("my-metric-without-a-timestamp", 10, undefined, ["tag:a", "tag:b"]);
  });

  it("does not send historical metrics from over 4 hours ago to the API", async () => {
    mock({
      "/opt/extensions/datadog-agent": Buffer.from([0]),
    });
    const apiScope = nock("https://api.example.com").post("/api/v1/distribution_points?api_key=api-key").reply(200, {});

    const metricTimeFiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "api-key",
      apiKeyKMS: "",
      apiKeySecretARN: "api-key-secret-arn",
      enhancedMetrics: false,
      logForwarding: false,
      shouldRetryMetrics: false,
      localTesting: true,
      siteURL,
    });

    await listener.onStartInvocation({});
    listener.sendDistributionMetricWithDate("my-metric-with-a-timestamp", 10, metricTimeFiveHoursAgo, false);
    await listener.onCompleteInvocation();

    expect(apiScope.isDone()).toBeFalsy();
  });

  it("logs metrics when logForwarding is enabled with custom timestamp", async () => {
    const spy = jest.spyOn(process.stdout, "write");
    // jest.spyOn(Date, "now").mockImplementation(() => 1487076708000);
    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "api-key",
      apiKeyKMS: "kms-api-key-encrypted",
      apiKeySecretARN: "api-key-secret-arn",
      enhancedMetrics: false,
      logForwarding: true,
      shouldRetryMetrics: false,
      localTesting: false,
      siteURL,
    });
    // jest.useFakeTimers();

    await listener.onStartInvocation({});
    listener.sendDistributionMetricWithDate("my-metric", 10, new Date(1584983836 * 1000), false, "tag:a", "tag:b");
    await listener.onCompleteInvocation();

    expect(spy).toHaveBeenCalledWith(`{"e":1584983836,"m":"my-metric","t":["tag:a","tag:b"],"v":10}\n`);
  });
});
