import { Handler } from "aws-lambda";

import { logError } from "./log";

/**
 * Wraps a lambda handler function, adding an onStart and onComplete hook.
 */
export function wrap<TEvent, TResult>(
  handler: Handler<TEvent, TResult>,
  onStart: (event: TEvent) => void,
  onComplete: () => Promise<void>,
): Handler<TEvent, TResult> {
  return (event, context, callback) => {
    // Lambda functions in node complete in one of two possible ways.
    // 1. By calling the "callback" function with a result.
    // 2. Returning a value directly from the function using a promise.
    try {
      onStart(event);
    } catch (error) {
      // Swallow the error and continue processing.
      logError("Pre-lambda hook threw error", { innerError: error });
    }

    // Handle the case where the result comes from a callback
    const modifiedCallback: typeof callback = (err, result) => {
      const cb = onComplete();
      cb.catch((error) => {
        logError("Post-lambda hook threw error", { innerError: error });
      }).finally(() => {
        callback(err, result);
      });
    };

    let promise = handler(event, context, modifiedCallback);

    // Handle the case where the result comes from a promise
    if (promise !== undefined) {
      promise = promise.then(
        (result) => {
          const cb = onComplete();
          // If there is a reject with the onComplete, swallow it and return the result as normal.
          return cb.then(
            () => result,
            (error) => {
              logError("Post-lambda hook threw error", { innerError: error });
              return result;
            },
          );
        },
        (rejection) => {
          const cb = onComplete();
          // Return the original reason for rejection, regardless of whether onComplete resolved or rejected.
          return cb.then(
            async () => {
              throw rejection;
            },
            async (error) => {
              logError("Post-lambda hook threw error", { innerError: error });
              throw rejection;
            },
          );
        },
      );
    }

    return promise;
  };
}
