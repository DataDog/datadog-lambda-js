/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Defines custom error types throwable by the runtime.
 */
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnhandledPromiseRejection = exports.UserCodeSyntaxError = exports.MalformedHandlerName = exports.HandlerNotFound = exports.ImportModuleError = exports.ExtendedError = exports.toFormatted = exports.toRuntimeResponse = exports.isError = void 0;
var util_1 = __importDefault(require("util"));
function isError(obj) {
    return (obj &&
        obj.name &&
        obj.message &&
        obj.stack &&
        typeof obj.name === "string" &&
        typeof obj.message === "string" &&
        typeof obj.stack === "string");
}
exports.isError = isError;
/**
 * Attempt to convert an object into a response object.
 * This method accounts for failures when serializing the error object.
 */
function toRuntimeResponse(error) {
    try {
        if (util_1.default.types.isNativeError(error) || isError(error)) {
            if (!error.stack) {
                throw new Error("Error stack is missing.");
            }
            return {
                errorType: error.name,
                errorMessage: error.message,
                trace: error.stack.split("\n") || [],
            };
        }
        else {
            return {
                errorType: typeof error,
                errorMessage: error.toString(),
                trace: [],
            };
        }
    }
    catch (_err) {
        return {
            errorType: "handled",
            errorMessage: "callback called with Error argument, but there was a problem while retrieving one or more of its message, name, and stack",
            trace: [],
        };
    }
}
exports.toRuntimeResponse = toRuntimeResponse;
/**
 * Format an error with the expected properties.
 * For compatability, the error string always starts with a tab.
 */
var toFormatted = function (error) {
    try {
        return ("\t" + JSON.stringify(error, function (_k, v) { return _withEnumerableProperties(v); }));
    }
    catch (err) {
        return "\t" + JSON.stringify(toRuntimeResponse(error));
    }
};
exports.toFormatted = toFormatted;
/**
 * Error name, message, code, and stack are all members of the superclass, which
 * means they aren't enumerable and don't normally show up in JSON.stringify.
 * This method ensures those interesting properties are available along with any
 * user-provided enumerable properties.
 */
function _withEnumerableProperties(error) {
    if (error instanceof Error) {
        var extendedError = error;
        var ret = Object.assign({
            errorType: extendedError.name,
            errorMessage: extendedError.message,
            code: extendedError.code,
        }, extendedError);
        if (typeof extendedError.stack == "string") {
            ret.stack = extendedError.stack.split("\n");
        }
        return ret;
    }
    else {
        return error;
    }
}
var ExtendedError = /** @class */ (function (_super) {
    __extends(ExtendedError, _super);
    function ExtendedError(reason) {
        var _newTarget = this.constructor;
        var _this = _super.call(this, reason) || this;
        Object.setPrototypeOf(_this, _newTarget.prototype); // restore prototype chain
        return _this;
    }
    return ExtendedError;
}(Error));
exports.ExtendedError = ExtendedError;
var ImportModuleError = /** @class */ (function (_super) {
    __extends(ImportModuleError, _super);
    function ImportModuleError() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return ImportModuleError;
}(ExtendedError));
exports.ImportModuleError = ImportModuleError;
var HandlerNotFound = /** @class */ (function (_super) {
    __extends(HandlerNotFound, _super);
    function HandlerNotFound() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return HandlerNotFound;
}(ExtendedError));
exports.HandlerNotFound = HandlerNotFound;
var MalformedHandlerName = /** @class */ (function (_super) {
    __extends(MalformedHandlerName, _super);
    function MalformedHandlerName() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return MalformedHandlerName;
}(ExtendedError));
exports.MalformedHandlerName = MalformedHandlerName;
var UserCodeSyntaxError = /** @class */ (function (_super) {
    __extends(UserCodeSyntaxError, _super);
    function UserCodeSyntaxError() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return UserCodeSyntaxError;
}(ExtendedError));
exports.UserCodeSyntaxError = UserCodeSyntaxError;
var UnhandledPromiseRejection = /** @class */ (function (_super) {
    __extends(UnhandledPromiseRejection, _super);
    function UnhandledPromiseRejection(reason, promise) {
        var _this = _super.call(this, reason) || this;
        _this.reason = reason;
        _this.promise = promise;
        return _this;
    }
    return UnhandledPromiseRejection;
}(ExtendedError));
exports.UnhandledPromiseRejection = UnhandledPromiseRejection;
var errorClasses = [
    ImportModuleError,
    HandlerNotFound,
    MalformedHandlerName,
    UserCodeSyntaxError,
    UnhandledPromiseRejection,
];
errorClasses.forEach(function (e) {
    e.prototype.name = "Runtime.".concat(e.name);
});
//# sourceMappingURL=errors.js.map