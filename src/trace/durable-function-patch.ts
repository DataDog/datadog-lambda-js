import { logDebug } from "../utils";
import { wrapDurableContext } from "./durable-function-context-wrapper";

let patchApplied = false;
let originalWithDurableExecution: ((...args: any[]) => any) | null = null;
let patchedSDK: any = null;

/**
 * Initialize automatic durable function tracing.
 * Call this when datadog-lambda-js loads.
 *
 * If @aws/durable-execution-sdk-js is installed, this patches
 * withDurableExecution to automatically wrap the context for tracing.
 */
export function initDurableFunctionTracing(): void {
  // Only patch once
  if (patchApplied) {
    return;
  }

  // Allow disabling via env var
  if (process.env.DD_DISABLE_DURABLE_FUNCTION_TRACING === "true") {
    logDebug("Durable function tracing disabled via DD_DISABLE_DURABLE_FUNCTION_TRACING");
    return;
  }

  try {
    // Try to require the SDK - if not installed, this throws
    const durableSDK = require("@aws/durable-execution-sdk-js");

    if (typeof durableSDK.withDurableExecution !== "function") {
      logDebug("Durable SDK found but withDurableExecution is not a function");
      return;
    }

    patchWithDurableExecution(durableSDK);
    patchApplied = true;
    logDebug("Durable function tracing enabled");
  } catch {
    // SDK not installed - this is expected for non-durable functions
    logDebug("Durable function tracing not enabled (SDK not found)");
  }
}

/**
 * Patch withDurableExecution to wrap context for automatic tracing.
 */
function patchWithDurableExecution(durableSDK: any): void {
  // Store original function and SDK reference for reset
  const originalFn = durableSDK.withDurableExecution;
  originalWithDurableExecution = originalFn;
  patchedSDK = durableSDK;

  // tslint:disable-next-line:ban-types
  durableSDK.withDurableExecution = function patchedWithDurableExecution(
    userHandler: (...args: any[]) => any,
    options?: any,
  ) {
    // Create a traced handler that wraps the user's handler
    const tracedHandler = async (event: any, ctx: any) => {
      // Wrap the context to enable operation tracing
      const tracedCtx = wrapDurableContext(ctx, event);

      // Call user's handler with wrapped context
      return userHandler(event, tracedCtx);
    };

    // Call original withDurableExecution with our traced handler
    return originalFn.call(durableSDK, tracedHandler, options);
  };
}

/**
 * Check if durable function tracing is active.
 */
export function isDurableFunctionTracingEnabled(): boolean {
  return patchApplied;
}

/**
 * Reset the patch state (for testing purposes).
 * Restores the original SDK function if it was patched.
 */
export function resetDurableFunctionPatch(): void {
  if (originalWithDurableExecution && patchedSDK) {
    patchedSDK.withDurableExecution = originalWithDurableExecution;
    originalWithDurableExecution = null;
    patchedSDK = null;
  }
  patchApplied = false;
}
