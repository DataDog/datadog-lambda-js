import { Handler } from "aws-lambda";

import { patchHttp, readTraceContext, TraceContextService } from "./trace";

/**
 * Configuration options for Datadog's lambda wrapper.
 */
export interface Config {
  /**
   * Whether to automatically patch all outgoing http requests with Datadog's hybrid tracing headers.
   * Defaults to true.
   */
  autoPatchHTTP: boolean;
}

const defaultConfig: Config = {
  autoPatchHTTP: true,
} as const;

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
  const contextService = new TraceContextService();

  if (finalConfig.autoPatchHTTP) {
    patchHttp(contextService);
  }

  return (event, context, callback) => {
    contextService.rootTraceContext = readTraceContext(event);
    return handler(event, context, callback);
  };
}

function getConfig(userConfig?: Partial<Config>): Config {
  if (userConfig === undefined) {
    return defaultConfig;
  }
  return {
    ...defaultConfig,
    ...userConfig,
  };
}
