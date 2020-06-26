import { Callback, Context, Handler } from "aws-lambda";

import { logError } from "./log";
import { serializeError } from "serialize-error";

export type OnWrapFunc<T = (...args: any[]) => any> = (fn: T) => T;

/**
 * Wraps a lambda handler function, adding an onStart and onComplete hook.
 */
export function wrap<TEvent, TResult>(
  handler: Handler<TEvent, TResult>,
  onStart: (event: TEvent, context: Context) => void,
  onComplete: (event: TEvent, context: Context, error?: Error) => Promise<void>,
  onWrap?: OnWrapFunc,
): Handler<TEvent, TResult> {
  const promHandler = promisifiedHandler(handler);

  return async (event: TEvent, context: Context) => {
    try {
      await onStart(event, context);
    } catch (error) {
      // Swallow the error and continue processing.
      const innerError = serializeError(error);
      logError("Pre-lambda hook threw error", { innerError });
    }
    let result: TResult;

    let handlerError: Error | undefined;
    let wrappedHandler = promHandler;
    // Try to apply onWrap to the handler, and if it fails, fall back to the original
    // handler.
    try {
      wrappedHandler = onWrap !== undefined ? onWrap(promHandler) : promHandler;
    } catch (error) {
      const innerError = serializeError(error);
      logError(`Failed to apply wrap to handler function ${innerError}`);
    }

    try {
      result = await wrappedHandler(event, context);
    } catch (error) {
      handlerError = error;
      throw error;
    } finally {
      try {
        if (handlerError) {
          await onComplete(event, context, handlerError);
        } else {
          await onComplete(event, context);
        }
      } catch (error) {
        // Swallow the error and continue processing.
        const innerError = serializeError(error);
        logError("Post-lambda hook threw error", { innerError });
      }
    }

    return result;
  };
}

export function promisifiedHandler<TEvent, TResult>(handler: Handler<TEvent, TResult>) {
  return (event: TEvent, context: Context) => {
    // Lambda functions in node complete in one of two possible ways.
    // 1. By calling the "callback" function with a result.
    // 2. Returning a value directly from the function using a promise.

    let modifiedCallback: Callback<TResult> = () => {};

    const callbackProm = new Promise<TResult>((resolve, reject) => {
      modifiedCallback = (err, result) => {
        if (err !== undefined && err !== null) {
          reject(err);
        } else {
          resolve(result);
        }
      };
    });

    const asyncProm = handler(event, context, modifiedCallback) as Promise<TResult> | undefined;
    let promise: Promise<TResult> = callbackProm;
    if (asyncProm !== undefined && typeof asyncProm.then === "function") {
      // Mimics behaviour of lambda runtime, the first method of returning a result always wins.
      promise = Promise.race([callbackProm, asyncProm]);
    }
    return promise;
  };
}
