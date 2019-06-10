import { Handler } from "aws-lambda";

import { APIClient, Distribution, Processor } from "./metrics";
import { extractTraceContext, patchHttp, TraceContextService, unpatchHttp } from "./trace";
import { logError, wrap } from "./utils";

const metricsBatchSendIntervalMS = 10000; // 10 seconds

const apiKeyEnvVar = "DD_API_KEY";
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
  shouldRetryMetrics: boolean;
  siteURL: string;
}

const defaultConfig: Config = {
  apiKey: "",
  autoPatchHTTP: true,
  shouldRetryMetrics: false,
  siteURL: "",
} as const;

let currentProcessor: Processor | undefined;

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

  const url = `https://api.${finalConfig.siteURL}`;
  const client = new APIClient(finalConfig.apiKey, url);
  return wrap(
    handler,
    (event) => {
      // Setup hook, (called once per handler invocation)
      currentProcessor = new Processor(client, metricsBatchSendIntervalMS, finalConfig.shouldRetryMetrics);
      currentProcessor.startProcessing();

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
      if (currentProcessor !== undefined) {
        await currentProcessor.flush();
      }
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
    currentProcessor.addMetric(dist);
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
  if (config.apiKey === "") {
    logError("no api key specified, can't send metrics", {});
  }

  if (config.siteURL === "") {
    config.siteURL = getEnvValue(siteURLEnvVar, defaultSiteURL);
  }

  return config;
}

function getEnvValue(key: string, defaultValue: string): string {
  const val = process.env[key];
  return val !== undefined ? val : defaultValue;
}
