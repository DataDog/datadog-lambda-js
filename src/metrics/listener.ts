import { KMS } from "aws-sdk";
import { promisify } from "util";

import { logError } from "../utils";
import { APIClient } from "./api";
import { Distribution } from "./model";
import { Processor } from "./processor";

const metricsBatchSendIntervalMS = 10000; // 10 seconds

export interface MetricsConfig {
  /**
   * Whether to retry sending metrics when flushing at the end of the lambda.
   * This can potentially delay the completion of your lambda.
   */
  shouldRetryMetrics: boolean;
  /**
   * The api key used to talk to the Datadog API. If this is empty, apiKeyKMS key
   * will be used instead.
   */
  apiKey: string;
  /**
   * A KMS encrypted api key used to talk to the Datadog API. It will automatically
   * be decrypted before any metrics are sent.
   */
  apiKeyKMS: string;
  /**
   * The site of the Datadog URL to send to. This should either be 'datadoghq.com', (default),
   * or 'datadoghq.eu', for customers in the eu.
   */
  siteURL: string;
}

export class MetricsListener {
  private currentProcessor?: Promise<Processor>;
  private apiKey: Promise<string>;

  constructor(private kmsClient: KMS, private config: MetricsConfig) {
    this.apiKey = this.getAPIKey(config);
  }

  public onStartInvocation(_: any) {
    this.currentProcessor = this.createProcessor(this.config, this.apiKey);
  }

  public async onCompleteInvocation() {
    // Flush any metrics
    try {
      if (this.currentProcessor !== undefined) {
        const processor = await this.currentProcessor;

        // After the processor becomes available, it's possible there are some pending
        // distribution metric promises. We make sure those promises run
        // first before we flush by yielding control of the event loop.
        await promisify(setImmediate)();

        await processor.flush();
      }
    } catch (error) {
      // This can fail for a variety of reasons, from the API not being reachable,
      // to KMS key decryption failing.
      logError(`failed to flush metrics`, { innerError: error });
    }
    this.currentProcessor = undefined;
  }

  public sendDistributionMetric(name: string, value: number, ...tags: string[]) {
    const dist = new Distribution(name, [{ timestamp: new Date(), value }], ...tags);
    if (this.currentProcessor !== undefined) {
      this.currentProcessor.then((processor) => {
        processor.addMetric(dist);
      });
    } else {
      logError("can't send metrics, datadog lambda handler not set up.");
    }
  }

  private async decodeKMSValue(value: string): Promise<string> {
    const buffer = Buffer.from(value);

    const result = await this.kmsClient.decrypt({ CiphertextBlob: buffer }).promise();
    if (result.Plaintext === undefined) {
      throw Error("Couldn't decrypt value");
    }
    return result.Plaintext.toString("utf-8");
  }

  private async createProcessor(config: MetricsConfig, apiKey: Promise<string>) {
    const key = await apiKey;
    const url = `https://api.${config.siteURL}`;
    const apiClient = new APIClient(key, url);
    const processor = new Processor(apiClient, metricsBatchSendIntervalMS, config.shouldRetryMetrics);
    processor.startProcessing();
    return processor;
  }

  private async getAPIKey(config: MetricsConfig) {
    if (config.apiKey !== "") {
      return config.apiKey;
    }

    if (config.apiKeyKMS !== "") {
      try {
        return await this.decodeKMSValue(config.apiKeyKMS);
      } catch (error) {
        logError("couldn't decrypt kms api key", { innerError: error });
      }
    } else {
      logError("api key not configured");
    }
    return "";
  }
}
