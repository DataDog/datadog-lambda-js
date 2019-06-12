import { AWSError, KMS, Request } from "aws-sdk";
import nock from "nock";

import { setErrorLoggingEnabled } from "../utils";
import { MetricsListener } from "./listener";

const siteURL = "example.com";

class MockKMS {
  public lastInput?: KMS.Types.DecryptRequest;

  constructor(public value: string, public error?: Error) {}

  public decrypt(params: KMS.Types.DecryptRequest, _?: (err: AWSError, data: KMS.Types.DecryptResponse) => void): any {
    this.lastInput = params;
    const result = this.error ? Promise.reject(this.error) : Promise.resolve({ Plaintext: this.value });
    return {
      promise: () => result,
    };
  }
}

setErrorLoggingEnabled(false);

describe("MetricsListener", () => {
  it("uses unencrypted api key by default", async () => {
    nock("https://api.example.com")
      .post("/api/v1/distribution_points?api_key=api-key")
      .reply(200, {});

    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "api-key",
      apiKeyKMS: "kms-api-key-encrypted",
      shouldRetryMetrics: false,
      siteURL,
    });

    listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, "tag:a", "tag:b");
    await listener.onCompleteInvocation();

    expect(nock.isDone()).toBeTruthy();
  });
  it("uses encrypted kms key if it's the only value available", async () => {
    nock("https://api.example.com")
      .post("/api/v1/distribution_points?api_key=kms-api-key-decrypted")
      .reply(200, {});

    const kms = new MockKMS("kms-api-key-decrypted");
    const listener = new MetricsListener(kms as any, {
      apiKey: "",
      apiKeyKMS: "kms-api-key-encrypted",
      shouldRetryMetrics: false,
      siteURL,
    });

    listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, "tag:a", "tag:b");
    await listener.onCompleteInvocation();

    expect(nock.isDone()).toBeTruthy();
  });
  it("doesn't throw an error if it can't get a valid apiKey", async () => {
    const kms = new MockKMS("kms-api-key-decrypted", new Error("The error"));
    const listener = new MetricsListener(kms as any, {
      apiKey: "",
      apiKeyKMS: "kms-api-key-encrypted",
      shouldRetryMetrics: false,
      siteURL,
    });

    listener.onStartInvocation({});
    listener.sendDistributionMetric("my-metric", 10, "tag:a", "tag:b");
    await expect(listener.onCompleteInvocation()).resolves.toEqual(undefined);
  });
});
