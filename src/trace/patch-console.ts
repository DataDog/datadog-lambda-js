import * as shimmer from "shimmer";
import { inspect } from "util";

import { getLogLevel, LogLevel, setLogLevel } from "../utils/log";
import { TraceContextService } from "./trace-context-service";

type LogMethod = "log" | "info" | "debug" | "error" | "warn" | "trace";

/**
 * Patches console output to include DataDog's trace context.
 * @param contextService Provides up to date tracing context.
 */
export function patchConsole(cnsle: Console, contextService: TraceContextService) {
  patchMethod(cnsle, "log", contextService);
  patchMethod(cnsle, "info", contextService);
  patchMethod(cnsle, "debug", contextService);
  patchMethod(cnsle, "error", contextService);
  patchMethod(cnsle, "warn", contextService);
  patchMethod(cnsle, "trace", contextService);
}

/**
 * Removes log patching to add DataDog's trace context.
 */
export function unpatchConsole(cnsle: Console) {
  unpatchMethod(cnsle, "log");
  unpatchMethod(cnsle, "info");
  unpatchMethod(cnsle, "debug");
  unpatchMethod(cnsle, "error");
  unpatchMethod(cnsle, "warn");
  unpatchMethod(cnsle, "trace");
}

function patchMethod(mod: Console, method: LogMethod, contextService: TraceContextService) {
  if (mod[method].__wrapped !== undefined) {
    return; // Only patch once
  }

  shimmer.wrap(mod, method, (original) => {
    let isLogging = false;
    return function emitWithContext(this: any, message?: any, ...optionalParams: any[]) {
      // Disable internal logging during this call, so we don't generate an infinite loop.

      // Re-entrance check, incase any of the code below tries to call a log method
      if (isLogging) {
        return original.apply(this as any, arguments as any);
      }
      isLogging = true;

      let prefix = "";
      const oldLogLevel = getLogLevel();
      setLogLevel(LogLevel.NONE);
      try {
        const context = contextService.currentTraceContext;
        if (context !== undefined) {
          const { traceID, parentID } = context;
          prefix = `[dd.trace_id=${traceID} dd.span_id=${parentID}]`;
          if (arguments.length === 0) {
            arguments.length = 1;
            arguments[0] = prefix;
          } else {
            let logContent = arguments[0];

            // If what's being logged is not a string, use util.inspect to get a str representation
            if (typeof logContent !== "string") {
              logContent = inspect(logContent);
            }

            arguments[0] = `${prefix} ${logContent}`;
          }
        }
      } catch (error) {
        // Swallow the error, because logging inside log shouldn't be supported
      }

      setLogLevel(oldLogLevel);
      isLogging = false;

      return original.apply(this as any, arguments as any);
    };
  });
}
function unpatchMethod(mod: Console, method: LogMethod) {
  if (mod[method].__wrapped !== undefined) {
    shimmer.unwrap(mod, method);
  }
}
