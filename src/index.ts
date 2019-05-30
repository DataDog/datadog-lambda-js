import { Handler } from "aws-lambda";

/**
 * Wraps your AWS lambda handle functions to add tracing/metrics support
 * @param handler A lambda handler function
 */
export function datadog<TEvent, TResult>(handler: Handler<TEvent, TResult>): Handler<TEvent, TResult> {
  return (event, context, callback) => {
    return handler(event, context, callback);
  };
}
