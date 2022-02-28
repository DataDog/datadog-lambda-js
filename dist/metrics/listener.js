"use strict";
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
exports.MetricsListener = void 0;
var hot_shots_1 = require("hot-shots");
var util_1 = require("util");
var utils_1 = require("../utils");
var api_1 = require("./api");
var extension_1 = require("./extension");
var metric_log_1 = require("./metric-log");
var model_1 = require("./model");
var processor_1 = require("./processor");
var metricsBatchSendIntervalMS = 10000; // 10 seconds
var MetricsListener = /** @class */ (function () {
    function MetricsListener(kmsClient, config) {
        this.kmsClient = kmsClient;
        this.config = config;
        this.isAgentRunning = undefined;
        this.apiKey = this.getAPIKey(config);
    }
    MetricsListener.prototype.onStartInvocation = function (_) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!(this.isAgentRunning === undefined)) return [3 /*break*/, 2];
                        _a = this;
                        return [4 /*yield*/, (0, extension_1.isAgentRunning)()];
                    case 1:
                        _a.isAgentRunning = _b.sent();
                        (0, utils_1.logDebug)("Extension present: ".concat(this.isAgentRunning));
                        _b.label = 2;
                    case 2:
                        if (this.isAgentRunning) {
                            (0, utils_1.logDebug)("Using StatsD client");
                            this.statsDClient = new hot_shots_1.StatsD({ host: "127.0.0.1", closingFlushInterval: 1 });
                            return [2 /*return*/];
                        }
                        if (this.config.logForwarding) {
                            (0, utils_1.logDebug)("logForwarding configured");
                            return [2 /*return*/];
                        }
                        this.currentProcessor = this.createProcessor(this.config, this.apiKey);
                        return [2 /*return*/];
                }
            });
        });
    };
    MetricsListener.prototype.onCompleteInvocation = function () {
        return __awaiter(this, void 0, void 0, function () {
            var processor, error_1, error_2;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 7, , 8]);
                        if (!(this.currentProcessor !== undefined)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.currentProcessor];
                    case 1:
                        processor = _a.sent();
                        // After the processor becomes available, it's possible there are some pending
                        // distribution metric promises. We make sure those promises run
                        // first before we flush by yielding control of the event loop.
                        return [4 /*yield*/, (0, util_1.promisify)(setImmediate)()];
                    case 2:
                        // After the processor becomes available, it's possible there are some pending
                        // distribution metric promises. We make sure those promises run
                        // first before we flush by yielding control of the event loop.
                        _a.sent();
                        return [4 /*yield*/, processor.flush()];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        if (!(this.statsDClient !== undefined)) return [3 /*break*/, 6];
                        (0, utils_1.logDebug)("Flushing statsD");
                        // Make sure all stats are flushed to extension
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                (_a = _this.statsDClient) === null || _a === void 0 ? void 0 : _a.close(function (error) {
                                    if (error !== undefined) {
                                        reject(error);
                                    }
                                    resolve();
                                });
                            })];
                    case 5:
                        // Make sure all stats are flushed to extension
                        _a.sent();
                        this.statsDClient = undefined;
                        _a.label = 6;
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        error_1 = _a.sent();
                        // This can fail for a variety of reasons, from the API not being reachable,
                        // to KMS key decryption failing.
                        if (error_1 instanceof Error) {
                            (0, utils_1.logError)("failed to flush metrics", error_1);
                        }
                        return [3 /*break*/, 8];
                    case 8:
                        _a.trys.push([8, 11, , 12]);
                        if (!this.isAgentRunning) return [3 /*break*/, 10];
                        (0, utils_1.logDebug)("Flushing Extension");
                        return [4 /*yield*/, (0, extension_1.flushExtension)()];
                    case 9:
                        _a.sent();
                        _a.label = 10;
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        error_2 = _a.sent();
                        if (error_2 instanceof Error) {
                            (0, utils_1.logError)("failed to flush extension", error_2);
                        }
                        return [3 /*break*/, 12];
                    case 12:
                        this.currentProcessor = undefined;
                        return [2 /*return*/];
                }
            });
        });
    };
    MetricsListener.prototype.sendDistributionMetricWithDate = function (name, value, metricTime, forceAsync) {
        var _a;
        var tags = [];
        for (var _i = 4; _i < arguments.length; _i++) {
            tags[_i - 4] = arguments[_i];
        }
        if (this.isAgentRunning) {
            (_a = this.statsDClient) === null || _a === void 0 ? void 0 : _a.distribution(name, value, undefined, tags);
            return;
        }
        if (this.config.logForwarding || forceAsync) {
            (0, metric_log_1.writeMetricToStdout)(name, value, metricTime, tags);
            return;
        }
        var dist = new (model_1.Distribution.bind.apply(model_1.Distribution, __spreadArray([void 0, name, [{ timestamp: metricTime, value: value }]], __read(tags), false)))();
        if (this.currentProcessor !== undefined) {
            // tslint:disable-next-line: no-floating-promises
            this.currentProcessor.then(function (processor) {
                processor.addMetric(dist);
            });
        }
        else {
            (0, utils_1.logError)("can't send metrics, datadog lambda handler not set up.");
        }
    };
    MetricsListener.prototype.sendDistributionMetric = function (name, value, forceAsync) {
        var tags = [];
        for (var _i = 3; _i < arguments.length; _i++) {
            tags[_i - 3] = arguments[_i];
        }
        this.sendDistributionMetricWithDate.apply(this, __spreadArray([name, value, new Date(Date.now()), forceAsync], __read(tags), false));
    };
    MetricsListener.prototype.createProcessor = function (config, apiKey) {
        return __awaiter(this, void 0, void 0, function () {
            var key, url, apiClient, processor;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, apiKey];
                    case 1:
                        key = _a.sent();
                        url = "https://api.".concat(config.siteURL);
                        apiClient = new api_1.APIClient(key, url);
                        processor = new processor_1.Processor(apiClient, metricsBatchSendIntervalMS, config.shouldRetryMetrics);
                        processor.startProcessing();
                        return [2 /*return*/, processor];
                }
            });
        });
    };
    MetricsListener.prototype.getAPIKey = function (config) {
        return __awaiter(this, void 0, void 0, function () {
            var error_3, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (config.apiKey !== "") {
                            return [2 /*return*/, config.apiKey];
                        }
                        if (!(config.apiKeyKMS !== "")) return [3 /*break*/, 5];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.kmsClient.decrypt(config.apiKeyKMS)];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        error_3 = _a.sent();
                        if (error_3 instanceof Error) {
                            (0, utils_1.logError)("couldn't decrypt kms api key", error_3);
                        }
                        return [3 /*break*/, 4];
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        errorMessage = "api key not configured, see https://dtdg.co/sls-node-metrics";
                        if (config.logForwarding) {
                            (0, utils_1.logDebug)(errorMessage);
                        }
                        else {
                            (0, utils_1.logError)(errorMessage);
                        }
                        _a.label = 6;
                    case 6: return [2 /*return*/, ""];
                }
            });
        });
    };
    return MetricsListener;
}());
exports.MetricsListener = MetricsListener;
//# sourceMappingURL=listener.js.map