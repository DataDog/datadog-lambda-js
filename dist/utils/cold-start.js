"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._resetColdStart = exports.getColdStartTag = exports.didFunctionColdStart = exports.setColdStart = void 0;
var functionDidColdStart = true;
var isColdStartSet = false;
/**
 * Use global variables to determine whether the container cold started
 * On the first container run, isColdStartSet and functionDidColdStart are true
 * For subsequent executions isColdStartSet will be true and functionDidColdStart will be false
 */
function setColdStart() {
    functionDidColdStart = !isColdStartSet;
    isColdStartSet = true;
}
exports.setColdStart = setColdStart;
function didFunctionColdStart() {
    return functionDidColdStart;
}
exports.didFunctionColdStart = didFunctionColdStart;
function getColdStartTag() {
    return "cold_start:".concat(didFunctionColdStart());
}
exports.getColdStartTag = getColdStartTag;
// For testing, reset the globals to their original values
function _resetColdStart() {
    functionDidColdStart = true;
    isColdStartSet = false;
}
exports._resetColdStart = _resetColdStart;
//# sourceMappingURL=cold-start.js.map