"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
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
exports.getEnvValue = exports.getTraceHeaders = exports.sendDistributionMetric = exports.sendDistributionMetricWithDate = exports.datadog = exports.defaultConfig = exports.defaultSiteURL = exports.traceExtractorEnvVar = exports.mergeXrayTracesEnvVar = exports.lambdaTaskRootEnvVar = exports.datadogHandlerEnvVar = exports.enhancedMetricsEnvVar = exports.logInjectionEnvVar = exports.logForwardingEnvVar = exports.logLevelEnvVar = exports.siteURLEnvVar = exports.traceManagedServicesEnvVar = exports.captureLambdaPayloadEnvVar = exports.apiKeyKMSEnvVar = exports.apiKeyEnvVar = void 0;
var metrics_1 = require("./metrics");
var trace_1 = require("./trace");
var utils_1 = require("./utils");
exports.apiKeyEnvVar = "DD_API_KEY";
exports.apiKeyKMSEnvVar = "DD_KMS_API_KEY";
exports.captureLambdaPayloadEnvVar = "DD_CAPTURE_LAMBDA_PAYLOAD";
exports.traceManagedServicesEnvVar = "DD_TRACE_MANAGED_SERVICES";
exports.siteURLEnvVar = "DD_SITE";
exports.logLevelEnvVar = "DD_LOG_LEVEL";
exports.logForwardingEnvVar = "DD_FLUSH_TO_LOG";
exports.logInjectionEnvVar = "DD_LOGS_INJECTION";
exports.enhancedMetricsEnvVar = "DD_ENHANCED_METRICS";
exports.datadogHandlerEnvVar = "DD_LAMBDA_HANDLER";
exports.lambdaTaskRootEnvVar = "LAMBDA_TASK_ROOT";
exports.mergeXrayTracesEnvVar = "DD_MERGE_XRAY_TRACES";
exports.traceExtractorEnvVar = "DD_TRACE_EXTRACTOR";
exports.defaultSiteURL = "datadoghq.com";
exports.defaultConfig = {
    apiKey: "",
    apiKeyKMS: "",
    autoPatchHTTP: true,
    captureLambdaPayload: false,
    createInferredSpan: true,
    debugLogging: false,
    enhancedMetrics: true,
    forceWrap: false,
    injectLogContext: true,
    logForwarding: false,
    mergeDatadogXrayTraces: false,
    shouldRetryMetrics: false,
    siteURL: "",
};
var currentMetricsListener;
var currentTraceListener;
/**
 * Wraps your AWS lambda handler functions to add tracing/metrics support
 * @param handler A lambda handler function.
 * @param config Configuration options for datadog.
 * @returns A wrapped handler function.
 *
 * ```javascript
 * import { datadog } from 'datadog-lambda-layer';
 * function yourHandler(event) {}
 * exports.yourHandler = datadog(yourHandler);
 * ```
 */
function datadog(handler, config) {
    var _this = this;
    var finalConfig = getConfig(config);
    var metricsListener = new metrics_1.MetricsListener(new metrics_1.KMSService(), finalConfig);
    var traceListener = new trace_1.TraceListener(finalConfig);
    // Only wrap the handler once unless forced
    var _ddWrappedKey = "_ddWrapped";
    if (handler[_ddWrappedKey] !== undefined && !finalConfig.forceWrap) {
        return handler;
    }
    (0, utils_1.setLogLevel)(finalConfig.debugLogging ? utils_1.LogLevel.DEBUG : utils_1.LogLevel.ERROR);
    if (finalConfig.logger) {
        (0, utils_1.setLogger)(finalConfig.logger);
    }
    var promHandler = (0, utils_1.promisifiedHandler)(handler);
    var wrappedFunc = function (event, context) { return __awaiter(_this, void 0, void 0, function () {
        var err_1, result, localResult, error, didThrow, err_2, err_3;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    (0, utils_1.setColdStart)();
                    currentMetricsListener = metricsListener;
                    currentTraceListener = traceListener;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, traceListener.onStartInvocation(event, context)];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, metricsListener.onStartInvocation(event)];
                case 3:
                    _a.sent();
                    if (finalConfig.enhancedMetrics) {
                        (0, metrics_1.incrementInvocationsMetric)(metricsListener, context);
                    }
                    return [3 /*break*/, 5];
                case 4:
                    err_1 = _a.sent();
                    if (err_1 instanceof Error) {
                        (0, utils_1.logDebug)("Failed to start listeners", err_1);
                    }
                    return [3 /*break*/, 5];
                case 5:
                    didThrow = false;
                    _a.label = 6;
                case 6:
                    _a.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, traceListener.onWrap(function (localEvent, localContext) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _a.trys.push([0, , 2, 3]);
                                        return [4 /*yield*/, promHandler(localEvent, localContext)];
                                    case 1:
                                        localResult = _a.sent();
                                        return [3 /*break*/, 3];
                                    case 2:
                                        traceListener.onEndingInvocation(localEvent, localResult, finalConfig.captureLambdaPayload);
                                        return [7 /*endfinally*/];
                                    case 3: return [2 /*return*/, localResult];
                                }
                            });
                        }); })(event, context)];
                case 7:
                    result = _a.sent();
                    return [3 /*break*/, 9];
                case 8:
                    err_2 = _a.sent();
                    didThrow = true;
                    error = err_2;
                    return [3 /*break*/, 9];
                case 9:
                    _a.trys.push([9, 12, , 13]);
                    if (didThrow && finalConfig.enhancedMetrics) {
                        (0, metrics_1.incrementErrorsMetric)(metricsListener, context);
                    }
                    return [4 /*yield*/, metricsListener.onCompleteInvocation()];
                case 10:
                    _a.sent();
                    return [4 /*yield*/, traceListener.onCompleteInvocation()];
                case 11:
                    _a.sent();
                    return [3 /*break*/, 13];
                case 12:
                    err_3 = _a.sent();
                    if (err_3 instanceof Error) {
                        (0, utils_1.logDebug)("Failed to complete listeners", err_3);
                    }
                    return [3 /*break*/, 13];
                case 13:
                    currentMetricsListener = undefined;
                    currentTraceListener = undefined;
                    if (didThrow) {
                        throw error;
                    }
                    return [2 /*return*/, result];
            }
        });
    }); };
    wrappedFunc[_ddWrappedKey] = true;
    return wrappedFunc;
}
exports.datadog = datadog;
/**
 * Sends a Distribution metric asynchronously to the Datadog API.
 * @param name The name of the metric to send.
 * @param value The value of the metric
 * @param metricTime The timestamp associated with this metric data point.
 * @param tags The tags associated with the metric. Should be of the format "tag:value".
 */
function sendDistributionMetricWithDate(name, value, metricTime) {
    var tags = [];
    for (var _i = 3; _i < arguments.length; _i++) {
        tags[_i - 3] = arguments[_i];
    }
    tags = __spreadArray(__spreadArray([], __read(tags), false), [getRuntimeTag()], false);
    if (currentMetricsListener !== undefined) {
        currentMetricsListener.sendDistributionMetricWithDate.apply(currentMetricsListener, __spreadArray([name, value, metricTime, false], __read(tags), false));
    }
    else {
        (0, utils_1.logError)("handler not initialized");
    }
}
exports.sendDistributionMetricWithDate = sendDistributionMetricWithDate;
/**
 * Sends a Distribution metric asynchronously to the Datadog API.
 * @param name The name of the metric to send.
 * @param value The value of the metric
 * @param tags The tags associated with the metric. Should be of the format "tag:value".
 */
function sendDistributionMetric(name, value) {
    var tags = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        tags[_i - 2] = arguments[_i];
    }
    tags = __spreadArray(__spreadArray([], __read(tags), false), [getRuntimeTag()], false);
    if (currentMetricsListener !== undefined) {
        currentMetricsListener.sendDistributionMetric.apply(currentMetricsListener, __spreadArray([name, value, false], __read(tags), false));
    }
    else {
        (0, utils_1.logError)("handler not initialized");
    }
}
exports.sendDistributionMetric = sendDistributionMetric;
/**
 * Retrieves the Datadog headers for the current trace.
 */
function getTraceHeaders() {
    if (currentTraceListener === undefined) {
        return {};
    }
    return currentTraceListener.currentTraceHeaders;
}
exports.getTraceHeaders = getTraceHeaders;
function getConfig(userConfig) {
    var config;
    if (userConfig === undefined) {
        config = exports.defaultConfig;
    }
    else {
        config = __assign(__assign({}, exports.defaultConfig), userConfig);
    }
    if (config.apiKey === "") {
        config.apiKey = getEnvValue(exports.apiKeyEnvVar, "");
    }
    if (config.siteURL === "") {
        config.siteURL = getEnvValue(exports.siteURLEnvVar, exports.defaultSiteURL);
    }
    if (config.apiKeyKMS === "") {
        config.apiKeyKMS = getEnvValue(exports.apiKeyKMSEnvVar, "");
    }
    if (userConfig === undefined || userConfig.injectLogContext === undefined) {
        var result = getEnvValue(exports.logInjectionEnvVar, "true").toLowerCase();
        config.injectLogContext = result === "true";
    }
    if (userConfig === undefined || userConfig.debugLogging === undefined) {
        var result = getEnvValue(exports.logLevelEnvVar, "ERROR").toLowerCase();
        config.debugLogging = result === "debug";
    }
    if (userConfig === undefined || userConfig.logForwarding === undefined) {
        var result = getEnvValue(exports.logForwardingEnvVar, "false").toLowerCase();
        config.logForwarding = result === "true";
    }
    if (userConfig === undefined || userConfig.enhancedMetrics === undefined) {
        var result = getEnvValue(exports.enhancedMetricsEnvVar, "true").toLowerCase();
        config.enhancedMetrics = result === "true";
    }
    if (userConfig === undefined || userConfig.mergeDatadogXrayTraces === undefined) {
        var result = getEnvValue(exports.mergeXrayTracesEnvVar, "false").toLowerCase();
        config.mergeDatadogXrayTraces = result === "true";
    }
    if (userConfig === undefined || userConfig.captureLambdaPayload === undefined) {
        var result = getEnvValue(exports.captureLambdaPayloadEnvVar, "false").toLowerCase();
        config.captureLambdaPayload = result === "true";
    }
    if (userConfig === undefined || userConfig.createInferredSpan === undefined) {
        var result = getEnvValue(exports.traceManagedServicesEnvVar, "true").toLowerCase();
        config.createInferredSpan = result === "true";
    }
    return config;
}
function getEnvValue(key, defaultValue) {
    var val = process.env[key];
    return val !== undefined ? val : defaultValue;
}
exports.getEnvValue = getEnvValue;
function getRuntimeTag() {
    var version = process.version;
    return "dd_lambda_layer:datadog-node".concat(version);
}
//# sourceMappingURL=index.js.map