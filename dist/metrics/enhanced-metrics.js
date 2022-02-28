"use strict";
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementErrorsMetric = exports.incrementInvocationsMetric = exports.getEnhancedMetricTags = exports.getRuntimeTag = exports.getVersionTag = void 0;
var constants_1 = require("../constants");
var arn_1 = require("../utils/arn");
var cold_start_1 = require("../utils/cold-start");
var process_version_1 = require("../utils/process-version");
var ENHANCED_LAMBDA_METRICS_NAMESPACE = "aws.lambda.enhanced";
// Same tag strings added to normal Lambda integration metrics
var RuntimeTagValues;
(function (RuntimeTagValues) {
    RuntimeTagValues["Node12"] = "nodejs12.x";
    RuntimeTagValues["Node14"] = "nodejs14.x";
})(RuntimeTagValues || (RuntimeTagValues = {}));
function getVersionTag() {
    return "datadog_lambda:v".concat(constants_1.datadogLambdaVersion);
}
exports.getVersionTag = getVersionTag;
/**
 * Uses process.version to create a runtime tag
 * If a version cannot be identified, returns null
 * See https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
 */
function getRuntimeTag() {
    var processVersion = (0, process_version_1.getProcessVersion)();
    var processVersionTagString = null;
    if (processVersion.startsWith("v12")) {
        processVersionTagString = RuntimeTagValues.Node12;
    }
    if (processVersion.startsWith("v14")) {
        processVersionTagString = RuntimeTagValues.Node14;
    }
    if (!processVersionTagString) {
        return null;
    }
    return "runtime:".concat(processVersionTagString);
}
exports.getRuntimeTag = getRuntimeTag;
function getEnhancedMetricTags(context) {
    var arnTags = ["functionname:".concat(context.functionName)];
    if (context.invokedFunctionArn) {
        arnTags = (0, arn_1.parseTagsFromARN)(context.invokedFunctionArn, context.functionVersion);
    }
    var tags = __spreadArray(__spreadArray([], __read(arnTags), false), [(0, cold_start_1.getColdStartTag)(), "memorysize:".concat(context.memoryLimitInMB), getVersionTag()], false);
    var runtimeTag = getRuntimeTag();
    if (runtimeTag) {
        tags.push(runtimeTag);
    }
    return tags;
}
exports.getEnhancedMetricTags = getEnhancedMetricTags;
/**
 * Increments the specified enhanced metric, applying all relevant tags
 * @param context object passed to invocation by AWS
 * @param metricName name of the enhanced metric without namespace prefix, i.e. "invocations" or "errors"
 */
function incrementEnhancedMetric(listener, metricName, context) {
    // Always write enhanced metrics to standard out
    listener.sendDistributionMetric.apply(listener, __spreadArray(["aws.lambda.enhanced.".concat(metricName), 1, true], __read(getEnhancedMetricTags(context)), false));
}
function incrementInvocationsMetric(listener, context) {
    incrementEnhancedMetric(listener, "invocations", context);
}
exports.incrementInvocationsMetric = incrementInvocationsMetric;
function incrementErrorsMetric(listener, context) {
    incrementEnhancedMetric(listener, "errors", context);
}
exports.incrementErrorsMetric = incrementErrorsMetric;
//# sourceMappingURL=enhanced-metrics.js.map