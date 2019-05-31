import { Handler } from "aws-lambda";

import { patchHttp, readTraceContext, TraceContextService } from "./trace";

/**
 * Wraps your AWS lambda handle functions to add tracing/metrics support
 * @param handler A lambda handler function
 */
export function datadog<TEvent, TResult>(handler: Handler<TEvent, TResult>): Handler<TEvent, TResult> {
  const contextService = new TraceContextService();
  patchHttp(contextService);

  return (event, context, callback) => {
    contextService.rootTraceContext = readTraceContext(event, process.env);
    return handler(event, context, callback);
  };
}
