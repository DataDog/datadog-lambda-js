import * as shimmer from "shimmer";

type Console = typeof console;

type wrappedConsole = Console & { [K in LogMethod]: { __wrapped?: boolean } };

import { getLogLevel, LogLevel, setLogLevel } from "../utils/log";
import { TraceContextService } from "./trace-context-service";

type LogMethod = "log" | "info" | "debug" | "error" | "warn" | "trace";

/**
 * Checks if a value is a JSON-style structured log (plain object).
 * When true, trace context will be injected as a `dd` property to preserve JSON format.
 * When false, trace context will be prepended as a string prefix.
 */
function isJsonStyleLog(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Patches console output to include DataDog's trace context.
 * @param contextService Provides up to date tracing context.
 */
export function patchConsole(cnsle: wrappedConsole, contextService: TraceContextService) {
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

function patchMethod(mod: wrappedConsole, method: LogMethod, contextService: TraceContextService) {
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

      const oldLogLevel = getLogLevel();
      setLogLevel(LogLevel.NONE);
      try {
        const context = contextService.currentTraceContext;
        if (context !== null) {
          const traceId = context.toTraceId();
          const spanId = context.toSpanId();

          if (arguments.length === 0) {
            // No arguments: emit just the trace context prefix
            arguments.length = 1;
            arguments[0] = `[dd.trace_id=${traceId} dd.span_id=${spanId}]`;
          } else if (arguments.length === 1 && isJsonStyleLog(arguments[0])) {
            // Single plain object: inject dd property to preserve JSON format
            // Merge with existing dd property if present
            const existingDd =
              arguments[0].dd && typeof arguments[0].dd === "object" && !Array.isArray(arguments[0].dd)
                ? arguments[0].dd
                : {};
            arguments[0] = {
              ...arguments[0],
              dd: {
                ...existingDd,
                trace_id: traceId,
                span_id: spanId,
              },
            };
          } else {
            // String or multiple arguments: use string prefix
            const prefix = `[dd.trace_id=${traceId} dd.span_id=${spanId}]`;
            arguments[0] = `${prefix} ${arguments[0]}`;
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
function unpatchMethod(mod: wrappedConsole, method: LogMethod) {
  if (mod[method].__wrapped !== undefined) {
    shimmer.unwrap(mod, method);
  }
}
