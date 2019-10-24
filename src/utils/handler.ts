import { Callback, Context, Handler } from "aws-lambda";

import { logError } from "./log";

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
      logError("Pre-lambda hook threw error", { innerError: error });
    }
    let result: TResult;
    // Need to disable linter rule to explicitly assign the variable, otherwise TS
    // won't reccognize that the var may be assigned in the catch block
    // tslint:disable-next-line: no-unnecessary-initializer
    let handlerError: Error | undefined = undefined;

    try {
      const wrappedHandler = onWrap !== undefined ? onWrap(promHandler) : promHandler;
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
        logError("Post-lambda hook threw error", { innerError: error });
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

    let promise = handler(event, context, modifiedCallback) as Promise<TResult> | undefined;
    if (promise === undefined) {
      promise = callbackProm;
    }
    return promise;
  };
}
