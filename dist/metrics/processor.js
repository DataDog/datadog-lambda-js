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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Processor = void 0;
var promise_retry_1 = __importDefault(require("promise-retry"));
var utils_1 = require("../utils");
var batcher_1 = require("./batcher");
var defaultRetryIntervalMS = 250;
/**
 * Processor batches metrics, and sends them to the API periodically.
 */
var Processor = /** @class */ (function () {
    /**
     * Create a new Processor.
     * @param client The api client to use to send to metrics to Datadog.
     * @param intervalMS The interval in milliseconds, after which to send a batch of metrics.
     * @param shouldRetryOnFail Whether the processor to retry to send any metrics that weren't successfully flushed.
     * @param retryInterval The amount of time before retrying the final flush.
     */
    function Processor(client, intervalMS, shouldRetryOnFail, retryInterval) {
        if (retryInterval === void 0) { retryInterval = defaultRetryIntervalMS; }
        this.client = client;
        this.shouldRetryOnFail = shouldRetryOnFail;
        this.retryInterval = retryInterval;
        this.batcher = new batcher_1.Batcher();
        this.timer = new utils_1.Timer(intervalMS);
    }
    /**
     * Start processing incoming metrics asynchronously.
     */
    Processor.prototype.startProcessing = function () {
        if (this.loopPromise !== undefined) {
            return;
        }
        this.timer.start();
        this.loopPromise = this.sendMetricsLoop();
    };
    /**
     * Add a new metric to be batched and sent.
     */
    Processor.prototype.addMetric = function (metric) {
        this.batcher.add(metric);
    };
    /**
     * Send any unprocessed metrics. Resolves on completion.
     */
    Processor.prototype.flush = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.timer.complete();
                        if (this.loopPromise === undefined) {
                            this.loopPromise = this.sendMetricsLoop();
                        }
                        return [4 /*yield*/, this.loopPromise];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Processor.prototype.sendMetricsLoop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var oldBatcher, metrics, _a, finalMetrics, options, _b;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.timer.nextTimeout()];
                    case 1:
                        if (!!(_c.sent())) return [3 /*break*/, 6];
                        oldBatcher = this.batcher;
                        this.batcher = new batcher_1.Batcher();
                        metrics = oldBatcher.toAPIMetrics();
                        if (metrics.length === 0) {
                            return [3 /*break*/, 0];
                        }
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.client.sendMetrics(metrics)];
                    case 3:
                        _c.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _a = _c.sent();
                        // Failed to send metrics, keep the old batch alive if retrying is enabled
                        if (this.shouldRetryOnFail) {
                            this.batcher = oldBatcher;
                        }
                        return [3 /*break*/, 5];
                    case 5: return [3 /*break*/, 0];
                    case 6:
                        finalMetrics = this.batcher.toAPIMetrics();
                        if (finalMetrics.length === 0) {
                            return [2 /*return*/];
                        }
                        _c.label = 7;
                    case 7:
                        _c.trys.push([7, 9, , 10]);
                        options = {
                            maxTimeout: this.retryInterval,
                            minTimeout: this.retryInterval,
                            retries: this.shouldRetryOnFail ? 2 : 0,
                        };
                        return [4 /*yield*/, (0, promise_retry_1.default)(options, function (retry) { return _this.client.sendMetrics(finalMetrics).catch(retry); })];
                    case 8:
                        _c.sent();
                        return [3 /*break*/, 10];
                    case 9:
                        _b = _c.sent();
                        throw Error("Failed to send metrics to Datadog");
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    return Processor;
}());
exports.Processor = Processor;
//# sourceMappingURL=processor.js.map