import { Handler } from "aws-lambda";

import { patchHttp, readTraceContext, TraceContextService } from "./trace";

/**
 * Configuration options for DataDogs lambda wrapper.
 */
export interface Config {
  // Whether to automatically patch all outgoing http requests with DataDog's
  // hybrid tracing headers
  autoPatchHTTP: boolean;
}

const defaultConfig: Config = {
  autoPatchHTTP: true,
} as const;

/**
 * Wraps your AWS lambda handle functions to add tracing/metrics support
 * @param handler A lambda handler function
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
    contextService.rootTraceContext = readTraceContext(event, process.env);
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
