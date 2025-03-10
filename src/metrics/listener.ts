import { StatsD } from "hot-shots";
import { promisify } from "util";
import { logDebug, logError, logWarning } from "../utils";
import { flushExtension, isExtensionRunning } from "./extension";
import { KMSService } from "./kms-service";
import { writeMetricToStdout } from "./metric-log";
import { Distribution } from "./model";
import { Context } from "aws-lambda";
import { getEnhancedMetricTags } from "./enhanced-metrics";
import { SecretsManagerClientConfig } from "@aws-sdk/client-secrets-manager";

const METRICS_BATCH_SEND_INTERVAL = 10000; // 10 seconds
const HISTORICAL_METRICS_THRESHOLD_HOURS = 4 * 60 * 60 * 1000; // 4 hours

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
   * An api key stored in secrets manager used to talk to the Datadog API.
   */
  apiKeySecretARN: string;
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

  /**
   * Whether to call the extension's Flush endpoint in a local test
   * Only needed locally, as the extension knows about the end of the invocation
   * from the runtime
   */
  localTesting: boolean;
}

export class MetricsListener {
  private currentProcessor?: Promise<any>;
  private apiKey: Promise<string>;
  private statsDClient?: StatsD;
  private isExtensionRunning?: boolean = undefined;
  private globalTags?: string[] = [];

  constructor(private kmsClient: KMSService, private config: MetricsConfig) {
    this.apiKey = this.getAPIKey(config);
    this.config = config;
  }

  public async onStartInvocation(_: any, context?: Context) {
    if (this.isExtensionRunning === undefined) {
      this.isExtensionRunning = await isExtensionRunning();
      logDebug(`Extension present: ${this.isExtensionRunning}`);
    }

    if (this.isExtensionRunning) {
      logDebug(`Using StatsD client`);

      this.globalTags = this.getGlobalTags(context);
      // About 200 chars per metric, so 8KB buffer size holds approx 40 metrics per request
      this.statsDClient = new StatsD({ host: "127.0.0.1", closingFlushInterval: 1, maxBufferSize: 8192 });
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
      if (error instanceof Error) {
        logError("failed to flush metrics", error as Error);
      }
    }

    // Flush only when testing extension locally.
    // Passing config flag so we can lazy load the request module.
    if (this.isExtensionRunning) {
      await flushExtension(this.config.localTesting);
    }
    this.currentProcessor = undefined;
  }

  public sendDistributionMetricWithDate(
    name: string,
    value: number,
    metricTime: Date, // TODO: Next breaking change to update to optional or 'Date | undefined'?
    forceAsync: boolean,
    ...tags: string[]
  ) {
    if (this.isExtensionRunning) {
      const isMetricTimeValid = Date.parse(metricTime.toString()) > 0;
      if (isMetricTimeValid) {
        const dateCeiling = new Date(Date.now() - HISTORICAL_METRICS_THRESHOLD_HOURS); // 4 hours ago
        if (dateCeiling > metricTime) {
          logWarning(`Timestamp ${metricTime.toISOString()} is older than 4 hours, not submitting metric ${name}`);
          return;
        }
        // Only create the processor to submit metrics to the API when a user provides a valid timestamp as
        // Dogstatsd does not support timestamps for distributions.
        this.currentProcessor = this.createProcessor(this.config, this.apiKey);
        // Add global tags to metrics sent to the API
        if (this.globalTags !== undefined && this.globalTags.length > 0) {
          tags = [...tags, ...this.globalTags];
        }
      } else {
        this.statsDClient?.distribution(name, value, undefined, tags);
        return;
      }
    }
    if (this.config.logForwarding || forceAsync) {
      writeMetricToStdout(name, value, metricTime, tags);
      return;
    }

    const dist = new Distribution(name, [{ timestamp: metricTime, value }], ...tags);

    if (!this.apiKey) {
      const errorMessage = "api key not configured, see https://dtdg.co/sls-node-metrics";
      logError(errorMessage);
      return;
    }
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
    // The Extension doesn't support distribution metrics with timestamps. Use sendDistributionMetricWithDate instead.
    const metricTime = this.isExtensionRunning ? new Date(0) : new Date(Date.now());
    this.sendDistributionMetricWithDate(name, value, metricTime, forceAsync, ...tags);
  }

  private async createProcessor(config: MetricsConfig, apiKey: Promise<string>) {
    if (!this.config.logForwarding) {
      const { APIClient } = require("./api");
      const { Processor } = require("./processor");

      const key = await apiKey;
      const url = `https://api.${config.siteURL}`;
      const apiClient = new APIClient(key, url);
      const processor = new Processor(apiClient, METRICS_BATCH_SEND_INTERVAL, config.shouldRetryMetrics);
      processor.startProcessing(this.globalTags);
      return processor;
    }
  }

  private async getAPIKey(config: MetricsConfig) {
    if (config.apiKey !== "") {
      return config.apiKey;
    }

    if (config.apiKeyKMS !== "") {
      try {
        return await this.kmsClient.decrypt(config.apiKeyKMS);
      } catch (error) {
        logError("couldn't decrypt kms api key", error as Error);
      }
    }

    if (config.apiKeySecretARN !== "") {
      try {
        const { SecretsManager } = await import("@aws-sdk/client-secrets-manager");
        const region = process.env.AWS_REGION;
        let secretsParams: SecretsManagerClientConfig = {};
        if (region) {
          const isGovRegion = region.startsWith("us-gov-");
          secretsParams = {
            useFipsEndpoint: isGovRegion,
            region,
          };
        }
        const secretsManager = new SecretsManager(secretsParams);
        const secret = await secretsManager.getSecretValue({ SecretId: config.apiKeySecretARN });
        return secret?.SecretString ?? "";
      } catch (error) {
        logError("couldn't get secrets manager api key", error as Error);
      }
    }
    return "";
  }

  private getGlobalTags(context?: Context) {
    const tags = getEnhancedMetricTags(context);
    if (context?.invokedFunctionArn) {
      const splitArn = context.invokedFunctionArn.split(":");
      if (splitArn.length > 7) {
        // Get rid of the alias
        splitArn.pop();
      }
      const arn = splitArn.join(":");
      tags.push(`function_arn:${arn}`);
    }
    return tags;
  }
}
