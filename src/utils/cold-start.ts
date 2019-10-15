let functionDidColdStart = true;

let isColdStartSet = false;

/**
 * Use global variables to determine whether the container cold started
 * On the first container run, isColdStartSet and functionDidColdStart are true
 * For subsequent executions isColdStartSet will be true and functionDidColdStart will be false
 */
export function setColdStart() {
  functionDidColdStart = !isColdStartSet;
  isColdStartSet = true;
}

export function didFunctionColdStart() {
  return functionDidColdStart;
}

export function getColdStartTag() {
  return `cold_start:${didFunctionColdStart()}`;
}

// For testing, reset the globals to their original values
export function _resetColdStart() {
  functionDidColdStart = true;
  isColdStartSet = false;
}
