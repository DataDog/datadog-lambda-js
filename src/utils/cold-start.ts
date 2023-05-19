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

// For testing, reset the globals to their original values
export function _resetColdStart() {
  functionDidColdStart = true;
  proactiveInitialization = false;
  isColdStartSet = false;
}
