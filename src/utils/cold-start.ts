let functionDidColdStart = true;
let proactiveInitialization = false;

let isColdStartSet = false;

/**
 * Use global variables to determine whether the container cold started
 * and if the start was proactively initialized
 * On the first container run, isColdStartSet and functionDidColdStart are true
 * For subsequent executions isColdStartSet will be true and functionDidColdStart will be false
 */
export function setSandboxInit(initTime: number, invocationStartTime: number) {
  if (!isColdStartSet && invocationStartTime - initTime > 10_000) {
    proactiveInitialization = true;
    functionDidColdStart = false;
  } else {
    functionDidColdStart = !isColdStartSet;
    proactiveInitialization = false;
  }
  isColdStartSet = true;
}

export function didFunctionColdStart(): boolean {
  return functionDidColdStart;
}

export function isProactiveInitialization(): boolean {
  return proactiveInitialization;
}

export function getSandboxInitTags(): string[] {
  const tags = [`cold_start:${didFunctionColdStart()}`];
  if (isProactiveInitialization()) {
    tags.push("proactive_initialization:true");
  }

  return tags;
}

/**
 * Checks if the Lambda function is running in managed instances mode.
 * In managed instances mode, we should not create cold start tracing spans
 * as the tracer library handles this independently.
 * @returns true if running in managed instances mode, false otherwise
 */
export function isManagedInstancesMode(): boolean {
  return process.env.AWS_LAMBDA_INITIALIZATION_TYPE === "lambda-managed-instances";
}

/**
 * Checks if the Lambda function is running with provisioned concurrency.
 * With provisioned concurrency, containers are pre-warmed before invocations,
 * so the gap between initialization and invocation can be very large (minutes or hours).
 * Cold start spans created from pre-warm module load times would have inflated durations
 * and are not useful in the context of the actual invocation.
 * @returns true if running with provisioned concurrency, false otherwise
 */
export function isProvisionedConcurrency(): boolean {
  return process.env.AWS_LAMBDA_INITIALIZATION_TYPE === "provisioned-concurrency";
}

// For testing, reset the globals to their original values
export function _resetColdStart() {
  functionDidColdStart = true;
  proactiveInitialization = false;
  isColdStartSet = false;
}
