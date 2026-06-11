import { Callback, Context, Handler } from "aws-lambda";
import { HANDLER_STREAMING, STREAM_RESPONSE } from "../constants";
import { EventEmitter } from "events";

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

    if (asyncProm !== undefined && typeof (asyncProm as any).then === "function") {
      // Mimics behaviour of lambda runtime, the first method of returning a result always wins.
      promise = Promise.race([callbackProm, asyncProm as Promise<TResult>]);
    } else if (handler.length >= 3) {
      // Handler takes a callback, wait for the callback to be called
      promise = callbackProm;
    } else if (asyncProm === undefined) {
      // Handler returned nothing (implicit `undefined`) and doesn't take a callback parameter.
      // It must be relying on `context.succeed` / `context.done` / `context.fail` to signal
      // completion (e.g. `aws-serverless-express`'s `proxy()` with the default
      // `CONTEXT_SUCCEED` resolution mode, or any other fire-and-forget pattern that finishes
      // asynchronously). Wait for callbackProm rather than resolving immediately, otherwise
      // the wrapper would shortcut the function before its work finishes, which causes the
      // Lambda runtime to return an empty response and freeze the worker before any pending
      // stdout writes are flushed to CloudWatch.
      promise = callbackProm;
    } else {
      // Handler returned a value directly (non-thenable).
      // Distinguish between:
      //  - ordinary sync return value -> resolve immediately
      //  - side-effect artifact (e.g. aws-serverless-express server) -> wait for context.done

      // Heuristic: trying to detect common types of side-effect artifacts
      const looksLikeArtifact =
        typeof asyncProm === "object" &&
        asyncProm !== null &&
        // 1. Node.js http.Server or similar
        ((typeof (asyncProm as any).listen === "function" && typeof (asyncProm as any).close === "function") ||
          // 2. EventEmitter-like (has .on and .emit)
          (typeof (asyncProm as any).on === "function" && typeof (asyncProm as any).emit === "function") ||
          // 3. Instance of EventEmitter (covers Server, Socket, etc.)
          asyncProm instanceof EventEmitter ||
          // 4. Constructor name hint
          ((asyncProm as any).constructor && /Server|Socket|Emitter/i.test((asyncProm as any).constructor.name)));

      if (looksLikeArtifact) {
        // Wait for callbackProm instead (the context.done/succeed/fail will resolve it)
        promise = callbackProm;
      } else {
        // Return the value directly
        promise = Promise.resolve(asyncProm);
      }
    }
    return promise;
  };
}
