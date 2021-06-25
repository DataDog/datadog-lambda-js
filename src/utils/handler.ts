import { Callback, Context, Handler } from "aws-lambda";

import { logError } from "./log";

export type OnWrapFunc<T = (...args: any[]) => any> = (fn: T) => T;

/**
 * Wraps a lambda handler function, adding an onStart and onComplete hook.
 */
export function wrap<TEvent, TResult>(
  handler: Handler<TEvent, TResult>,
  onStart: (event: TEvent, context: Context) => Promise<void>,
  onComplete: (event: TEvent, context: Context, error?: Error) => Promise<void>,
  onWrap?: OnWrapFunc,
): Handler<TEvent, TResult | undefined> {
  const promHandler = promisifiedHandler(handler);

  return async (event: TEvent, context: Context) => {
    try {
      await onStart(event, context);
    } catch (error) {
      // Swallow the error and continue processing.
      logError("Pre-lambda hook threw error", error);
    }
    let result: TResult | undefined;

    let handlerError: Error | undefined;
    let wrappedHandler = promHandler;
    // Try to apply onWrap to the handler, and if it fails, fall back to the original
    // handler.
    try {
      wrappedHandler = onWrap !== undefined ? onWrap(promHandler) : promHandler;
    } catch (error) {
      logError("Failed to apply wrap to handler function", error);
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
        logError("Post-lambda hook threw error", error);
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
    let modifiedLegacyDoneCallback: Callback<TResult> = () => {};
    let modifiedLegacySucceedCallback: (res: any) => void = () => {};
    let modifiedLegacyFailCallback: (err: any) => void = () => {};

    const callbackProm = new Promise<TResult | undefined>((resolve, reject) => {
      modifiedCallback = (err, result) => {
        if (err !== undefined && err !== null) {
          reject(err);
        } else {
          resolve(result);
        }
      };
      // Legacy done callback finished immediately, and doesn't wait for pending
      // event loop
      modifiedLegacyDoneCallback = (err, result) => {
        context.callbackWaitsForEmptyEventLoop = false;
        if (err !== undefined && err !== null) {
          reject(err);
        } else {
          resolve(result);
        }
      };
      modifiedLegacySucceedCallback = (result) => {
        context.callbackWaitsForEmptyEventLoop = false;
        resolve(result);
      };
      modifiedLegacyFailCallback = (err: any) => {
        context.callbackWaitsForEmptyEventLoop = false;
        reject(err);
      };
    });
    context.done = modifiedLegacyDoneCallback;
    context.succeed = modifiedLegacySucceedCallback;
    context.fail = modifiedLegacyFailCallback;

    const asyncProm = handler(event, context, modifiedCallback) as Promise<TResult> | undefined;
    let promise: Promise<TResult | undefined> = callbackProm;
    if (asyncProm !== undefined && typeof asyncProm.then === "function") {
      // Mimics behaviour of lambda runtime, the first method of returning a result always wins.
      promise = Promise.race([callbackProm, asyncProm]);
    }
    return promise;
  };
}
