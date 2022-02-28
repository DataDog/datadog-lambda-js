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
Object.defineProperty(exports, "__esModule", { value: true });
exports.promisifiedHandler = exports.wrap = void 0;
var log_1 = require("./log");
/**
 * Wraps a lambda handler function, adding an onStart and onComplete hook.
 */
function wrap(handler, onStart, onComplete, onWrap) {
    var _this = this;
    var promHandler = promisifiedHandler(handler);
    return function (event, context) { return __awaiter(_this, void 0, void 0, function () {
        var error_1, result, handlerError, wrappedHandler, error_2, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, onStart(event, context)];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    if (error_1 instanceof Error) {
                        // Swallow the error and continue processing.
                        (0, log_1.logError)("Pre-lambda hook threw error", error_1);
                    }
                    return [3 /*break*/, 3];
                case 3:
                    wrappedHandler = promHandler;
                    // Try to apply onWrap to the handler, and if it fails, fall back to the original
                    // handler.
                    try {
                        wrappedHandler = onWrap !== undefined ? onWrap(promHandler) : promHandler;
                    }
                    catch (error) {
                        if (error instanceof Error) {
                            (0, log_1.logError)("Failed to apply wrap to handler function", error);
                        }
                    }
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 6, 7, 14]);
                    return [4 /*yield*/, wrappedHandler(event, context)];
                case 5:
                    result = _a.sent();
                    return [3 /*break*/, 14];
                case 6:
                    error_2 = _a.sent();
                    if (error_2 instanceof Error) {
                        handlerError = error_2;
                    }
                    throw error_2;
                case 7:
                    _a.trys.push([7, 12, , 13]);
                    if (!handlerError) return [3 /*break*/, 9];
                    return [4 /*yield*/, onComplete(event, context, handlerError)];
                case 8:
                    _a.sent();
                    return [3 /*break*/, 11];
                case 9: return [4 /*yield*/, onComplete(event, context)];
                case 10:
                    _a.sent();
                    _a.label = 11;
                case 11: return [3 /*break*/, 13];
                case 12:
                    error_3 = _a.sent();
                    if (error_3 instanceof Error) {
                        // Swallow the error and continue processing.
                        (0, log_1.logError)("Post-lambda hook threw error", error_3);
                    }
                    return [3 /*break*/, 13];
                case 13: return [7 /*endfinally*/];
                case 14: return [2 /*return*/, result];
            }
        });
    }); };
}
exports.wrap = wrap;
function promisifiedHandler(handler) {
    return function (event, context) {
        // Lambda functions in node complete in one of two possible ways.
        // 1. By calling the "callback" function with a result.
        // 2. Returning a value directly from the function using a promise.
        var modifiedCallback = function () { };
        var modifiedLegacyDoneCallback = function () { };
        var modifiedLegacySucceedCallback = function () { };
        var modifiedLegacyFailCallback = function () { };
        var callbackProm = new Promise(function (resolve, reject) {
            modifiedCallback = function (err, result) {
                if (err !== undefined && err !== null) {
                    reject(err);
                }
                else {
                    resolve(result);
                }
            };
            // Legacy done callback finished immediately, and doesn't wait for pending
            // event loop
            modifiedLegacyDoneCallback = function (err, result) {
                context.callbackWaitsForEmptyEventLoop = false;
                if (err !== undefined && err !== null) {
                    reject(err);
                }
                else {
                    resolve(result);
                }
            };
            modifiedLegacySucceedCallback = function (result) {
                context.callbackWaitsForEmptyEventLoop = false;
                resolve(result);
            };
            modifiedLegacyFailCallback = function (err) {
                context.callbackWaitsForEmptyEventLoop = false;
                reject(err);
            };
        });
        context.done = modifiedLegacyDoneCallback;
        context.succeed = modifiedLegacySucceedCallback;
        context.fail = modifiedLegacyFailCallback;
        var asyncProm = handler(event, context, modifiedCallback);
        var promise = callbackProm;
        if (asyncProm !== undefined && typeof asyncProm.then === "function") {
            // Mimics behaviour of lambda runtime, the first method of returning a result always wins.
            promise = Promise.race([callbackProm, asyncProm]);
        }
        return promise;
    };
}
exports.promisifiedHandler = promisifiedHandler;
//# sourceMappingURL=handler.js.map