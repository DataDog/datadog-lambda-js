import { Handler } from "aws-lambda";

import { KMSService, MetricsConfig, MetricsListener } from "./metrics";
import { TraceConfig, TraceListener } from "./trace";
import { logError, wrap } from "./utils";

const apiKeyEnvVar = "DD_API_KEY";
const apiKeyKMSEnvVar = "DD_KMS_API_KEY";
const siteURLEnvVar = "DD_SITE";

const defaultSiteURL = "datadoghq.com";

/**
 * Configuration options for Datadog's lambda wrapper.
 */
export type Config = MetricsConfig & TraceConfig;

const defaultConfig: Config = {
  apiKey: "",
  apiKeyKMS: "",
  autoPatchHTTP: true,
  shouldRetryMetrics: false,
  siteURL: "",
} as const;

let currentMetricsListener: MetricsListener | undefined;

/**
 * Wraps your AWS lambda handler functions to add tracing/metrics support
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
  const metricsListener = new MetricsListener(new KMSService(), finalConfig);
  const listeners = [metricsListener, new TraceListener(finalConfig)];

  return wrap(
    handler,
    (event) => {
      currentMetricsListener = metricsListener;
      // Setup hook, (called once per handler invocation)
      for (const listener of listeners) {
        listener.onStartInvocation(event);
      }
    },
    async () => {
      // Completion hook, (called once per handler invocation)
      for (const listener of listeners) {
        await listener.onCompleteInvocation();
      }
      currentMetricsListener = undefined;
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
  if (currentMetricsListener !== undefined) {
    currentMetricsListener.sendDistributionMetric(name, value, ...tags);
  } else {
    logError("handler not initialized");
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

function getEnvValue(key: string, defaultValue: string): string {
  const val = process.env[key];
  return val !== undefined ? val : defaultValue;
}
