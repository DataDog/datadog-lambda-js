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
Object.defineProperty(exports, "__esModule", { value: true });
exports.logError = exports.logDebug = exports.getLogLevel = exports.setLogLevel = exports.setLogger = exports.LogLevel = void 0;
var serialize_error_1 = require("serialize-error");
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["ERROR"] = 1] = "ERROR";
    LogLevel[LogLevel["NONE"] = 2] = "NONE";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
var logger = console;
var logLevel = LogLevel.ERROR;
function setLogger(customLogger) {
    logger = customLogger;
}
exports.setLogger = setLogger;
function setLogLevel(level) {
    logLevel = level;
}
exports.setLogLevel = setLogLevel;
function getLogLevel() {
    return logLevel;
}
exports.getLogLevel = getLogLevel;
function logDebug(message, metadata, error) {
    if (logLevel > LogLevel.DEBUG) {
        return;
    }
    emitLog(logger.debug, "debug", message, metadata, error);
}
exports.logDebug = logDebug;
function logError(message, metadata, error) {
    if (logLevel > LogLevel.ERROR) {
        return;
    }
    emitLog(logger.error, "error", message, metadata, error);
}
exports.logError = logError;
function emitLog(outputter, status, message, metadata, error) {
    message = "datadog:".concat(message);
    var output = { status: status, message: message };
    if (metadata instanceof Error && error === undefined) {
        // allow for log*(message), log*("message", metadata), log*("message", error), and log*("message", metadata, error)
        error = metadata;
        metadata = undefined;
    }
    if (metadata !== undefined) {
        output = __assign(__assign({}, output), metadata);
    }
    if (error !== undefined) {
        var errorInfo = (0, serialize_error_1.serializeError)(error);
        output = __assign(__assign({}, output), errorInfo);
    }
    outputter(JSON.stringify(output));
}
//# sourceMappingURL=log.js.map