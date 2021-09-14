import { promisify } from "util";

import { logDebug, logError } from "../utils";
import { APIClient } from "./api";
import { KMSService } from "./kms-service";
import { writeMetricToStdout } from "./metric-log";
import { Distribution } from "./model";
import { Processor } from "./processor";
import { StatsD } from "hot-shots";
import { isAgentRunning, flushExtension } from "./extension";

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

  /**
   * Whether to increment invocations and errors Lambda integration metrics from this layer.
   * @default false
   */
  enhancedMetrics: boolean;
}

export class MetricsListener {
  private currentProcessor?: Promise<Processor>;
  private apiKey: Promise<string>;
  private statsDClient?: StatsD;
  private isAgentRunning?: boolean = undefined;

  constructor(private kmsClient: KMSService, private config: MetricsConfig) {
    this.apiKey = this.getAPIKey(config);
  }

  public async onStartInvocation(_: any) {
    if (this.isAgentRunning === undefined) {
      this.isAgentRunning = await isAgentRunning();
      logDebug(`Extension present: ${this.isAgentRunning}`);
    }

    if (this.isAgentRunning) {
      logDebug(`Using StatsD client`);

      this.statsDClient = new StatsD({ host: "127.0.0.1", closingFlushInterval: 1 });
      return;
    }
    if (this.config.logForwarding) {
      logDebug(`logForwarding configured`);

      return;
    }
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
      if (this.statsDClient !== undefined) {
        logDebug(`Flushing statsD`);

        // Make sure all stats are flushed to extension
        await new Promise<void>((resolve, reject) => {
          this.statsDClient?.close((error) => {
            if (error !== undefined) {
              reject(error);
            }
            resolve();
          });
        });
        this.statsDClient = undefined;
      }
    } catch (error) {
      // This can fail for a variety of reasons, from the API not being reachable,
      // to KMS key decryption failing.
      logError("failed to flush metrics", error);
    }
    try {
      if (this.isAgentRunning) {
        logDebug(`Flushing Extension`);
        await flushExtension();
      }
    } catch (error) {
      logError("failed to flush extension", error);
    }
    this.currentProcessor = undefined;
  }

  public sendDistributionMetricWithDate(
    name: string,
    value: number,
    metricTime: Date,
    forceAsync: boolean,
    ...tags: string[]
  ) {
    if (this.isAgentRunning) {
      this.statsDClient?.distribution(name, value, undefined, tags);
      return;
    }
    if (this.config.logForwarding || forceAsync) {
      writeMetricToStdout(name, value, metricTime, tags);
      return;
    }

    const dist = new Distribution(name, [{ timestamp: metricTime, value }], ...tags);

    if (this.currentProcessor !== undefined) {
      // tslint:disable-next-line: no-floating-promises
      this.currentProcessor.then((processor) => {
        processor.addMetric(dist);
      });
    } else {
      logError("can't send metrics, datadog lambda handler not set up.");
    }
  }

  public sendDistributionMetric(name: string, value: number, forceAsync: boolean, ...tags: string[]) {
    this.sendDistributionMetricWithDate(name, value, new Date(Date.now()), forceAsync, ...tags);
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
        logError("couldn't decrypt kms api key", error);
      }
    } else {
      const errorMessage = "api key not configured, see https://dtdg.co/sls-node-metrics";
      if (config.logForwarding) {
        logDebug(errorMessage);
      } else {
        logError(errorMessage);
      }
    }
    return "";
  }
}
