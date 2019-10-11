let _didFunctionColdStart = true;

let _isColdStartSet = false;

/**
 * Use global variables to determine whether the container cold started
 * On the first container run, _isColdStartSet and _didFunctionColdStart are true
 * For subsequent executions _isColdStartSet will be true and _didFunctionColdStart will be false
 */
export function setColdStart() {
  _didFunctionColdStart = !_isColdStartSet;
  _isColdStartSet = true;
}

export function didFunctionColdStart() {
  return _didFunctionColdStart;
}

export function getColdStartTag() {
  return `cold_start:${didFunctionColdStart()}`;
}

// For testing, reset the globals to their original values
export function _resetColdStart() {
  _didFunctionColdStart = true;
  _isColdStartSet = false;
}
