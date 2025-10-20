import { Callback, Context, Handler } from "aws-lambda";
import { HANDLER_STREAMING, STREAM_RESPONSE } from "../constants";

export function promisifiedHandler<TEvent, TResult>(handler: Handler<TEvent, TResult> | any) {
  // Response Stream Lambda function.
  if (handler[HANDLER_STREAMING] !== undefined && handler[HANDLER_STREAMING] === STREAM_RESPONSE) {
    return (event: any, responseStream: any, context: Context) => {
      // This handler will always be a promise.
      const promise = handler(event, responseStream, context) as Promise<unknown>;
      return promise;
    };
  }

  // Buffered Lambda function.
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
    } else if (asyncProm === undefined && handler.length < 3) {
      // Handler returned undefined and doesn't take a callback parameter, resolve immediately
      promise = Promise.resolve(undefined);
    } else if (handler.length >= 3) {
      // Handler takes a callback, wait for the callback to be called
      promise = callbackProm;
    } else {
      // Handler returned a value directly (sync handler with return value), resolve with that value
      promise = Promise.resolve(asyncProm);
    }
    return promise;
  };
}
