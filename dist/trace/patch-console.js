"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unpatchConsole = exports.patchConsole = void 0;
var shimmer = __importStar(require("shimmer"));
var util_1 = require("util");
var log_1 = require("../utils/log");
/**
 * Patches console output to include DataDog's trace context.
 * @param contextService Provides up to date tracing context.
 */
function patchConsole(cnsle, contextService) {
    patchMethod(cnsle, "log", contextService);
    patchMethod(cnsle, "info", contextService);
    patchMethod(cnsle, "debug", contextService);
    patchMethod(cnsle, "error", contextService);
    patchMethod(cnsle, "warn", contextService);
    patchMethod(cnsle, "trace", contextService);
}
exports.patchConsole = patchConsole;
/**
 * Removes log patching to add DataDog's trace context.
 */
function unpatchConsole(cnsle) {
    unpatchMethod(cnsle, "log");
    unpatchMethod(cnsle, "info");
    unpatchMethod(cnsle, "debug");
    unpatchMethod(cnsle, "error");
    unpatchMethod(cnsle, "warn");
    unpatchMethod(cnsle, "trace");
}
exports.unpatchConsole = unpatchConsole;
function patchMethod(mod, method, contextService) {
    if (mod[method].__wrapped !== undefined) {
        return; // Only patch once
    }
    shimmer.wrap(mod, method, function (original) {
        var isLogging = false;
        return function emitWithContext(message) {
            // Disable internal logging during this call, so we don't generate an infinite loop.
            var optionalParams = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                optionalParams[_i - 1] = arguments[_i];
            }
            // Re-entrance check, incase any of the code below tries to call a log method
            if (isLogging) {
                return original.apply(this, arguments);
            }
            isLogging = true;
            var prefix = "";
            var oldLogLevel = (0, log_1.getLogLevel)();
            (0, log_1.setLogLevel)(log_1.LogLevel.NONE);
            try {
                var context = contextService.currentTraceContext;
                if (context !== undefined) {
                    var traceID = context.traceID, parentID = context.parentID;
                    prefix = "[dd.trace_id=".concat(traceID, " dd.span_id=").concat(parentID, "]");
                    if (arguments.length === 0) {
                        arguments.length = 1;
                        arguments[0] = prefix;
                    }
                    else {
                        var logContent = arguments[0];
                        // If what's being logged is not a string, use util.inspect to get a str representation
                        if (typeof logContent !== "string") {
                            logContent = (0, util_1.inspect)(logContent);
                        }
                        arguments[0] = "".concat(prefix, " ").concat(logContent);
                    }
                }
            }
            catch (error) {
                // Swallow the error, because logging inside log shouldn't be supported
            }
            (0, log_1.setLogLevel)(oldLogLevel);
            isLogging = false;
            return original.apply(this, arguments);
        };
    });
}
function unpatchMethod(mod, method) {
    if (mod[method].__wrapped !== undefined) {
        shimmer.unwrap(mod, method);
    }
}
//# sourceMappingURL=patch-console.js.map