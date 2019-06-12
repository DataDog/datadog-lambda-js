import { Handler } from "aws-lambda";
import { KMS } from "aws-sdk";
import { promisify } from "util";

import { APIClient, Distribution, Processor } from "./metrics";
import { extractTraceContext, patchHttp, TraceContextService, unpatchHttp } from "./trace";
import { logError, wrap } from "./utils";

const metricsBatchSendIntervalMS = 10000; // 10 seconds

const apiKeyEnvVar = "DD_API_KEY";
const apiKeyKMSEnvVar = "DD_KMS_API_KEY";
const siteURLEnvVar = "DD_SITE";

const defaultSiteURL = "datadoghq.com";

/**
 * Configuration options for Datadog's lambda wrapper.
 */
export interface Config {
  /**
   * Whether to automatically patch all outgoing http requests with Datadog's hybrid tracing headers.
   * Defaults to true.
   */
  autoPatchHTTP: boolean;
  apiKey: string;
  apiKeyKMS: string;
  shouldRetryMetrics: boolean;
  siteURL: string;
}

const defaultConfig: Config = {
  apiKey: "",
  apiKeyKMS: "",
  autoPatchHTTP: true,
  shouldRetryMetrics: false,
  siteURL: "",
} as const;

let currentProcessor: Promise<Processor> | undefined;

/**
 * Wraps your AWS lambda handle functions to add tracing/metrics support
 * @param handler A lambda handler function.
 * @param config  Configuration options for datadog.
 * @returns A wrapped handler function.
 *
 * ```javascript
 * import { datadog } from 'datadog-lambda-layer';
 * function yourHandler(event) {}
 * exports.yourHandler = datadog(yourHandler);
 * ```
 */
export function datadog<TEvent, TResult>(
  handler: Handler<TEvent, TResult>,
  config?: Partial<Config>,
): Handler<TEvent, TResult> {
  const finalConfig = getConfig(config);

  // APIKey can take time to retrieve, if the user has a kms key which needs to be decrypted.
  // This can be time consuming, so we cache the value for warm lambdas to reuse.
  const apiKey = getAPIKey(finalConfig);

  return wrap(
    handler,
    (event) => {
      // Setup hook, (called once per handler invocation)
      currentProcessor = createProcessor(finalConfig, apiKey);

      const contextService = new TraceContextService();
      if (finalConfig.autoPatchHTTP) {
        patchHttp(contextService);
      }
      contextService.rootTraceContext = extractTraceContext(event);
    },
    async () => {
      // Completion hook, (called once per handler invocation)
      if (finalConfig.autoPatchHTTP) {
        unpatchHttp();
      }

      // Flush any metrics
      try {
        if (currentProcessor !== undefined) {
          const processor = await currentProcessor;

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
      currentProcessor = undefined;
    },
  );
}

/**
 * Sends a Distribution metric asynchronously to the Datadog API.
 * @param name The name of the metric to send.
 * @param value The value of the metric
 * @param tags The tags associated with the metric. Should be of the format "tag:value".
 */
export function sendDistributionMetric(name: string, value: number, ...tags: string[]) {
  const dist = new Distribution(name, [{ timestamp: new Date(), value }], ...tags);
  if (currentProcessor !== undefined) {
    currentProcessor.then((processor) => {
      processor.addMetric(dist);
    });
  } else {
    logError("can't send metrics, datadog lambda handler not set up.");
  }
}

function getConfig(userConfig?: Partial<Config>): Config {
  let config: Config;

  if (userConfig === undefined) {
    config = defaultConfig;
  } else {
    config = {
      ...defaultConfig,
      ...userConfig,
    };
  }
  if (config.apiKey === "") {
    config.apiKey = getEnvValue(apiKeyEnvVar, "");
  }

  if (config.siteURL === "") {
    config.siteURL = getEnvValue(siteURLEnvVar, defaultSiteURL);
  }

  if (config.apiKeyKMS === "") {
    config.apiKeyKMS = getEnvValue(apiKeyKMSEnvVar, "");
  }

  return config;
}

async function decodeKMSValue(value: string): Promise<string> {
  const kms = new KMS();
  const buffer = Buffer.from(value);

  const result = await kms.decrypt({ CiphertextBlob: buffer }).promise();
  if (result.Plaintext === undefined) {
    throw Error("Couldn't decrypt value");
  }
  return result.Plaintext.toString("utf-8");
}

async function createProcessor(config: Config, apiKey: Promise<string>) {
  const key = await apiKey;
  const url = `https://api.${config.siteURL}`;
  const apiClient = new APIClient(key, url);
  const processor = new Processor(apiClient, metricsBatchSendIntervalMS, config.shouldRetryMetrics);
  processor.startProcessing();
  return processor;
}

async function getAPIKey(config: Config) {
  if (config.apiKey !== "") {
    return config.apiKey;
  }

  if (config.apiKeyKMS !== "") {
    try {
      return await decodeKMSValue(config.apiKeyKMS);
    } catch (error) {
      logError("couldn't decrypt kms api key", { innerError: error });
    }
  } else {
    logError("api key not configured");
  }
  return "";
}

function getEnvValue(key: string, defaultValue: string): string {
  const val = process.env[key];
  return val !== undefined ? val : defaultValue;
}
