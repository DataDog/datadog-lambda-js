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
exports.flushExtension = exports.isAgentRunning = exports.AGENT_URL = void 0;
var url_1 = require("url");
var utils_1 = require("../utils");
var fs_1 = __importDefault(require("fs"));
exports.AGENT_URL = "http://127.0.0.1:8124";
var HELLO_PATH = "/lambda/hello";
var FLUSH_PATH = "/lambda/flush";
var EXTENSION_PATH = "/opt/extensions/datadog-agent";
var AGENT_TIMEOUT_MS = 100;
function isAgentRunning() {
    return __awaiter(this, void 0, void 0, function () {
        var extensionExists, url, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fileExists(EXTENSION_PATH)];
                case 1:
                    extensionExists = _a.sent();
                    if (!extensionExists) {
                        (0, utils_1.logDebug)("Agent isn't present in sandbox");
                        return [2 /*return*/, false];
                    }
                    url = new url_1.URL(HELLO_PATH, exports.AGENT_URL);
                    return [4 /*yield*/, (0, utils_1.get)(url, { timeout: AGENT_TIMEOUT_MS })];
                case 2:
                    result = _a.sent();
                    if (!result.success) {
                        (0, utils_1.logDebug)("Could not connect to agent. ".concat(result.errorMessage));
                        return [2 /*return*/, false];
                    }
                    return [2 /*return*/, true];
            }
        });
    });
}
exports.isAgentRunning = isAgentRunning;
function flushExtension() {
    return __awaiter(this, void 0, void 0, function () {
        var url, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = new url_1.URL(FLUSH_PATH, exports.AGENT_URL);
                    return [4 /*yield*/, (0, utils_1.post)(url, {}, { timeout: AGENT_TIMEOUT_MS })];
                case 1:
                    result = _a.sent();
                    if (!result.success) {
                        (0, utils_1.logError)("Failed to flush extension. ".concat(result.errorMessage));
                        return [2 /*return*/, false];
                    }
                    return [2 /*return*/, true];
            }
        });
    });
}
exports.flushExtension = flushExtension;
function fileExists(filename) {
    return fs_1.default.promises
        .access(filename, fs_1.default.constants.F_OK)
        .then(function () { return true; })
        .catch(function () { return false; });
}
//# sourceMappingURL=extension.js.map