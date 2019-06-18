import { promisify } from "util";

import { logError } from "../utils";
import { APIClient } from "./api";
import { KMSService } from "./kms-service";
import { Distribution } from "./model";
import { Processor } from "./processor";

const metricsBatchSendIntervalMS = 10000; // 10 seconds

export interface MetricsConfig {
  /**
   * Whether to retry sending metrics when flushing at the end of the lambda.
   * This can potentially delay the completion of your lambda.
   * @default false
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
   * @default "datadoghq.com"
   */
  siteURL: string;

  /**
   * Whether to send metrics to cloud watch for log forwarding, rather than directly to the Datadog
   * API. This method requires more setup work, but when enabled won't have any effect on your lambda's performance.
   * @default false
   */
  logForwarding: boolean;
}

export class MetricsListener {
  private currentProcessor?: Promise<Processor>;
  private apiKey: Promise<string>;

  constructor(private kmsClient: KMSService, private config: MetricsConfig) {
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
    if (this.config.logForwarding) {
      console.log(
        JSON.stringify({
          metric_name: name,
          tags,
          timestamp: Date.now(),
          value,
        }),
      );
      return;
    }
    const dist = new Distribution(name, [{ timestamp: new Date(), value }], ...tags);

    if (this.currentProcessor !== undefined) {
      this.currentProcessor.then((processor) => {
        processor.addMetric(dist);
      });
    } else {
      logError("can't send metrics, datadog lambda handler not set up.");
    }
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
        return await this.kmsClient.decrypt(config.apiKeyKMS);
      } catch (error) {
        logError("couldn't decrypt kms api key", { innerError: error });
      }
    } else {
      logError("api key not configured");
    }
    return "";
  }
}
