import * as shimmer from "shimmer";

import { TraceContextService } from "../trace/trace-context-service";
import { getLogLevel, setLogLevel, LogLevel } from "../utils/log";

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
  shimmer.wrap(mod, method, (original) => {
    return function emitWithContext(this: any, message?: any, ...optionalParams: any[]) {
      // Disable internal logging during this call, so we don't generate an infinite loop.
      const oldLogLevel = getLogLevel();
      setLogLevel(LogLevel.NONE);

      const context = contextService.currentTraceContext;
      let prefix = "";
      if (context !== undefined) {
        const { traceID, parentID } = context;
        prefix = `[dd.trace_id=${traceID} dd.span_id=${parentID}]`;
        if (arguments.length === 0) {
          arguments.length = 1;
          arguments[0] = prefix;
        } else {
          arguments[0] = `${prefix} ${arguments[0]}`;
        }
      }
      setLogLevel(oldLogLevel);
      return original.apply(this as any, arguments as any);
    };
  });
}
function unpatchMethod(mod: Console, method: LogMethod) {
  if (mod[method].__wrapped !== undefined) {
    shimmer.unwrap(mod, method);
  }
}
