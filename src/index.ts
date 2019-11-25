import { Handler } from "aws-lambda";

import {
  incrementErrorsMetric,
  incrementInvocationsMetric,
  KMSService,
  MetricsConfig,
  MetricsListener,
} from "./metrics";
import { TraceConfig, TraceHeaders, TraceListener } from "./trace";
import { logError, LogLevel, setLogLevel, wrap } from "./utils";
import { setColdStart } from "utils/cold-start";

export { TraceHeaders } from "./trace";

const apiKeyEnvVar = "DD_API_KEY";
const apiKeyKMSEnvVar = "DD_KMS_API_KEY";
const siteURLEnvVar = "DD_SITE";
const logLevelEnvVar = "DD_LOG_LEVEL";
const logForwardingEnvVar = "DD_FLUSH_TO_LOG";
const enhancedMetricsEnvVar = "DD_ENHANCED_METRICS";

const defaultSiteURL = "datadoghq.com";

interface GlobalConfig {
  /**
   * Whether to log extra information.
   * @default false
   */
  debugLogging: boolean;
}

/**
 * Configuration options for Datadog's lambda wrapper.
 */
export type Config = MetricsConfig & TraceConfig & GlobalConfig;

export const defaultConfig: Config = {
  apiKey: "",
  apiKeyKMS: "",
  autoPatchHTTP: true,
  debugLogging: false,
  enhancedMetrics: false,
  logForwarding: false,
  mergeDatadogXrayTraces: false,
  shouldRetryMetrics: false,
  siteURL: "",
} as const;

let currentMetricsListener: MetricsListener | undefined;
let currentTraceListener: TraceListener | undefined;

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
  const handlerName = getEnvValue("_HANDLER", "handler");
  const traceListener = new TraceListener(finalConfig, handlerName);
  const listeners = [metricsListener, traceListener];

  return wrap(
    handler,
    (event, context) => {
      setColdStart();
      setLogLevel(finalConfig.debugLogging ? LogLevel.DEBUG : LogLevel.ERROR);
      currentMetricsListener = metricsListener;
      currentTraceListener = traceListener;
      // Setup hook, (called once per handler invocation)
      for (const listener of listeners) {
        listener.onStartInvocation(event, context);
      }
      if (finalConfig.enhancedMetrics) {
        incrementInvocationsMetric(context);
      }
    },
    async (event, context, error?) => {
      if (finalConfig.enhancedMetrics && error) {
        incrementErrorsMetric(context);
      }
      // Completion hook, (called once per handler invocation)
      for (const listener of listeners) {
        await listener.onCompleteInvocation();
      }
      currentMetricsListener = undefined;
      currentTraceListener = undefined;
    },
    (func) => traceListener.onWrap(func),
  );
}

/**
 * Sends a Distribution metric asynchronously to the Datadog API.
 * @param name The name of the metric to send.
 * @param value The value of the metric
 * @param tags The tags associated with the metric. Should be of the format "tag:value".
 */
export function sendDistributionMetric(name: string, value: number, ...tags: string[]) {
  tags = [...tags, getRuntimeTag()];

  if (currentMetricsListener !== undefined) {
    currentMetricsListener.sendDistributionMetric(name, value, ...tags);
  } else {
    logError("handler not initialized");
  }
}

/**
 * Retrieves the Datadog headers for the current trace.
 */
export function getTraceHeaders(): Partial<TraceHeaders> {
  if (currentTraceListener === undefined) {
    return {};
  }
  return currentTraceListener.currentTraceHeaders;
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

  if (userConfig === undefined || userConfig.debugLogging === undefined) {
    const result = getEnvValue(logLevelEnvVar, "ERROR").toLowerCase();
    config.debugLogging = result === "debug";
  }
  if (userConfig === undefined || userConfig.logForwarding === undefined) {
    const result = getEnvValue(logForwardingEnvVar, "false").toLowerCase();
    config.logForwarding = result === "true";
  }
  if (userConfig === undefined || userConfig.enhancedMetrics === undefined) {
    const result = getEnvValue(enhancedMetricsEnvVar, "false").toLowerCase();
    config.enhancedMetrics = result === "true";
  }

  return config;
}

export function getEnvValue(key: string, defaultValue: string): string {
  const val = process.env[key];
  return val !== undefined ? val : defaultValue;
}

function getRuntimeTag(): string {
  const version = process.version;
  return `dd_lambda_layer:datadog-node${version}`;
}
