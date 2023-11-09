import { Context, Handler } from "aws-lambda";
import { HANDLER_STREAMING, STREAM_RESPONSE } from "./constants";
import {
  incrementErrorsMetric,
  incrementInvocationsMetric,
  KMSService,
  MetricsConfig,
  MetricsListener,
} from "./metrics";
import { TraceConfig, TraceListener } from "./trace";
import { subscribeToDC } from "./runtime";
import {
  logDebug,
  logError,
  Logger,
  LogLevel,
  promisifiedHandler,
  setSandboxInit,
  setLogger,
  setLogLevel,
} from "./utils";
import { getEnhancedMetricTags } from "./metrics/enhanced-metrics";
import { DatadogTraceHeaders } from "trace/context/extractor";

export const apiKeyEnvVar = "DD_API_KEY";
export const apiKeyKMSEnvVar = "DD_KMS_API_KEY";
export const captureLambdaPayloadEnvVar = "DD_CAPTURE_LAMBDA_PAYLOAD";
export const traceManagedServicesEnvVar = "DD_TRACE_MANAGED_SERVICES";
export const siteURLEnvVar = "DD_SITE";
export const logLevelEnvVar = "DD_LOG_LEVEL";
export const logForwardingEnvVar = "DD_FLUSH_TO_LOG";
export const logInjectionEnvVar = "DD_LOGS_INJECTION";
export const enhancedMetricsEnvVar = "DD_ENHANCED_METRICS";
export const datadogHandlerEnvVar = "DD_LAMBDA_HANDLER";
export const lambdaTaskRootEnvVar = "LAMBDA_TASK_ROOT";
export const mergeXrayTracesEnvVar = "DD_MERGE_XRAY_TRACES";
export const traceExtractorEnvVar = "DD_TRACE_EXTRACTOR";
export const defaultSiteURL = "datadoghq.com";
export const encodeAuthorizerContextEnvVar = "DD_ENCODE_AUTHORIZER_CONTEXT";
export const decodeAuthorizerContextEnvVar = "DD_DECODE_AUTHORIZER_CONTEXT";
export const coldStartTracingEnvVar = "DD_COLD_START_TRACING";
export const minColdStartTraceDurationEnvVar = "DD_MIN_COLD_START_DURATION";
export const coldStartTraceSkipLibEnvVar = "DD_COLD_START_TRACE_SKIP_LIB";

interface GlobalConfig {
  /**
   * Whether to log extra information.
   * @default false
   */
  debugLogging: boolean;
  /**
   * Whether to force the `datadog()` wrapper to always wrap.
   * @default false
   */
  forceWrap: boolean;
  /**
   * Custom logger.
   */
  logger?: Logger;
}

/**
 * Configuration options for Datadog's lambda wrapper.
 */
export type Config = MetricsConfig & TraceConfig & GlobalConfig;

export const defaultConfig: Config = {
  apiKey: "",
  apiKeyKMS: "",
  autoPatchHTTP: true,
  captureLambdaPayload: false,
  createInferredSpan: true,
  debugLogging: false,
  encodeAuthorizerContext: true,
  decodeAuthorizerContext: true,
  enhancedMetrics: true,
  forceWrap: false,
  injectLogContext: true,
  logForwarding: false,
  mergeDatadogXrayTraces: false,
  shouldRetryMetrics: false,
  siteURL: "",
  minColdStartTraceDuration: 3,
  coldStartTraceSkipLib: "",
} as const;

let currentMetricsListener: MetricsListener | undefined;
let currentTraceListener: TraceListener | undefined;

if (getEnvValue(coldStartTracingEnvVar, "true").toLowerCase() === "true") {
  subscribeToDC();
}

const initTime = Date.now();

/**
 * Wraps your AWS lambda handler functions to add tracing/metrics support
 * @param handler A lambda handler function.
 * @param config Configuration options for datadog.
 * @returns A wrapped handler function.
 *
 * ```javascript
 * import { datadog } from 'datadog-lambda-js';
 * function yourHandler(event) {}
 * exports.yourHandler = datadog(yourHandler);
 * ```
 */
export function datadog<TEvent, TResult>(
  handler: Handler<TEvent, TResult> | any,
  config?: Partial<Config>,
): Handler<TEvent, TResult> | any {
  const finalConfig = getConfig(config);
  const metricsListener = new MetricsListener(new KMSService(), finalConfig);

  const traceListener = new TraceListener(finalConfig);

  // Only wrap the handler once unless forced
  const _ddWrappedKey = "_ddWrapped";
  if ((handler as any)[_ddWrappedKey] !== undefined && !finalConfig.forceWrap) {
    return handler;
  }

  setLogLevel(finalConfig.debugLogging ? LogLevel.DEBUG : LogLevel.ERROR);
  if (finalConfig.logger) {
    setLogger(finalConfig.logger);
  }

  const isResponseStreamFunction =
    handler[HANDLER_STREAMING] !== undefined && handler[HANDLER_STREAMING] === STREAM_RESPONSE;
  const promHandler: any = promisifiedHandler(handler);

  let wrappedFunc: any;
  wrappedFunc = async (...args: any[]) => {
    const { event, context, responseStream } = extractArgs(isResponseStreamFunction, ...args);
    const startTime = new Date();
    setSandboxInit(initTime, startTime.getTime());

    currentMetricsListener = metricsListener;
    currentTraceListener = traceListener;

    try {
      await traceListener.onStartInvocation(event, context);
      await metricsListener.onStartInvocation(event);
      if (finalConfig.enhancedMetrics) {
        incrementInvocationsMetric(metricsListener, context);
      }
    } catch (err) {
      if (err instanceof Error) {
        logDebug("Failed to start listeners", err);
      }
    }

    let result: TResult | undefined;
    let localResult: TResult | undefined;
    let error: any;
    let didThrow = false;
    try {
      const traceListenerOnWrap = async (...localArgs: any[]) => {
        const {
          event: localEvent,
          context: localContext,
          responseStream: localResponseStream,
        } = extractArgs(isResponseStreamFunction, ...localArgs);

        if (isResponseStreamFunction) {
          responseStream.once("drain", () => {
            const firstDrainTime = new Date();
            const timeToFirstByte = firstDrainTime.getTime() - startTime.getTime();
            metricsListener.sendDistributionMetric(
              "aws.lambda.enhanced.time_to_first_byte",
              timeToFirstByte,
              true,
              ...getEnhancedMetricTags(context),
            );
          });
        }

        try {
          localResult = isResponseStreamFunction
            ? await promHandler(localEvent, localResponseStream, localContext)
            : await promHandler(localEvent, localContext);
        } finally {
          const responseIs5xxError = traceListener.onEndingInvocation(
            localEvent,
            localResult,
            isResponseStreamFunction,
          );
          if (responseIs5xxError) {
            incrementErrorsMetric(metricsListener, context);
          }
        }
        return localResult;
      };

      result = isResponseStreamFunction
        ? await traceListener.onWrap(traceListenerOnWrap)(event, responseStream, context)
        : await traceListener.onWrap(traceListenerOnWrap)(event, context);
    } catch (err) {
      didThrow = true;
      error = err;
    }
    try {
      if (didThrow && finalConfig.enhancedMetrics) {
        incrementErrorsMetric(metricsListener, context);
      }
      await metricsListener.onCompleteInvocation();
      await traceListener.onCompleteInvocation(error, result, event);
    } catch (err) {
      if (err instanceof Error) {
        logDebug("Failed to complete listeners", err);
      }
    }
    currentMetricsListener = undefined;
    currentTraceListener = undefined;
    if (didThrow) {
      throw error;
    }

    return result as TResult;
  };

  (wrappedFunc as any)[_ddWrappedKey] = true;

  if (isResponseStreamFunction) {
    (wrappedFunc as any)[HANDLER_STREAMING] = STREAM_RESPONSE;
  }

  return wrappedFunc;
}

/**
 *
 * @param isResponseStreamFunction A boolean determining if a Lambda Function is Response Stream.
 * @param args Spread arguments of a Lambda Function.
 * @returns An object containing the context and the event of a Lambda Function.
 */
export function extractArgs<TEvent>(isResponseStreamFunction: boolean, ...args: any[]) {
  const context: Context = isResponseStreamFunction ? args[2] : args.length > 0 ? (args[1] as Context) : {};
  const event: TEvent = args[0];
  const responseStream: any = isResponseStreamFunction ? args[1] : undefined;
  return { context, event, responseStream };
}

/**
 * Sends a Distribution metric asynchronously to the Datadog API.
 * @param name The name of the metric to send.
 * @param value The value of the metric
 * @param metricTime The timestamp associated with this metric data point.
 * @param tags The tags associated with the metric. Should be of the format "tag:value".
 */
export function sendDistributionMetricWithDate(name: string, value: number, metricTime: Date, ...tags: string[]) {
  tags = [...tags, getRuntimeTag()];

  if (currentMetricsListener !== undefined) {
    currentMetricsListener.sendDistributionMetricWithDate(name, value, metricTime, false, ...tags);
  } else {
    logError("handler not initialized");
  }
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
    currentMetricsListener.sendDistributionMetric(name, value, false, ...tags);
  } else {
    logError("handler not initialized");
  }
}

/**
 * Retrieves the Datadog headers for the current trace.
 */
export function getTraceHeaders(): Partial<DatadogTraceHeaders> {
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

  if (userConfig === undefined || userConfig.injectLogContext === undefined) {
    const result = getEnvValue(logInjectionEnvVar, "true").toLowerCase();
    config.injectLogContext = result === "true";
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
    const result = getEnvValue(enhancedMetricsEnvVar, "true").toLowerCase();
    config.enhancedMetrics = result === "true";
  }
  if (userConfig === undefined || userConfig.mergeDatadogXrayTraces === undefined) {
    const result = getEnvValue(mergeXrayTracesEnvVar, "false").toLowerCase();
    config.mergeDatadogXrayTraces = result === "true";
  }

  if (userConfig === undefined || userConfig.captureLambdaPayload === undefined) {
    const result = getEnvValue(captureLambdaPayloadEnvVar, "false").toLowerCase();
    config.captureLambdaPayload = result === "true";
  }

  if (userConfig === undefined || userConfig.createInferredSpan === undefined) {
    const result = getEnvValue(traceManagedServicesEnvVar, "true").toLowerCase();
    config.createInferredSpan = result === "true";
  }

  if (userConfig === undefined || userConfig.encodeAuthorizerContext === undefined) {
    const result = getEnvValue(encodeAuthorizerContextEnvVar, "true").toLowerCase();
    config.encodeAuthorizerContext = result === "true";
  }

  if (userConfig === undefined || userConfig.decodeAuthorizerContext === undefined) {
    const result = getEnvValue(decodeAuthorizerContextEnvVar, "true").toLowerCase();
    config.decodeAuthorizerContext = result === "true";
  }

  if (userConfig === undefined || userConfig.minColdStartTraceDuration === undefined) {
    config.minColdStartTraceDuration = Number(getEnvValue(minColdStartTraceDurationEnvVar, "3"));
  }

  if (userConfig === undefined || userConfig.minColdStartTraceDuration === undefined) {
    config.coldStartTraceSkipLib = getEnvValue(coldStartTraceSkipLibEnvVar, "./opentracing/tracer");
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
