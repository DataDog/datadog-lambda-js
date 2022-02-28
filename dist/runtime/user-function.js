/**
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Modifications copyright 2021 Datadog, Inc.
 *
 * The original file was part of aws-lambda-nodejs-runtime-interface-client
 * https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/main/src/utils/UserFunction.ts
 *
 * This module defines the functions for loading the user's code as specified
 * in a handler string.
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.load = void 0;
var path_1 = __importDefault(require("path"));
var fs_1 = __importDefault(require("fs"));
var errors_1 = require("./errors");
var FUNCTION_EXPR = /^([^.]*)\.(.*)$/;
var RELATIVE_PATH_SUBSTRING = "..";
/**
 * Break the full handler string into two pieces, the module root and the actual
 * handler string.
 * Given './somepath/something/module.nestedobj.handler' this returns
 * ['./somepath/something', 'module.nestedobj.handler']
 */
function _moduleRootAndHandler(fullHandlerString) {
    var handlerString = path_1.default.basename(fullHandlerString);
    var moduleRoot = fullHandlerString.substring(0, fullHandlerString.indexOf(handlerString));
    return [moduleRoot, handlerString];
}
/**
 * Split the handler string into two pieces: the module name and the path to
 * the handler function.
 */
function _splitHandlerString(handler) {
    var match = handler.match(FUNCTION_EXPR);
    if (!match || match.length != 3) {
        throw new errors_1.MalformedHandlerName("Bad handler");
    }
    return [match[1], match[2]]; // [module, function-path]
}
/**
 * Resolve the user's handler function from the module.
 */
function _resolveHandler(object, nestedProperty) {
    return nestedProperty.split(".").reduce(function (nested, key) {
        return nested && nested[key];
    }, object);
}
/**
 * Verify that the provided path can be loaded as a file per:
 * https://nodejs.org/dist/latest-v10.x/docs/api/modules.html#modules_all_together
 * @param string - the fully resolved file path to the module
 * @return bool
 */
function _canLoadAsFile(modulePath) {
    return fs_1.default.existsSync(modulePath) || fs_1.default.existsSync(modulePath + ".js");
}
/**
 * Attempt to load the user's module.
 * Attempts to directly resolve the module relative to the application root,
 * then falls back to the more general require().
 */
function _tryRequire(appRoot, moduleRoot, module) {
    var lambdaStylePath = path_1.default.resolve(appRoot, moduleRoot, module);
    if (_canLoadAsFile(lambdaStylePath)) {
        return require(lambdaStylePath);
    }
    else {
        // Why not just require(module)?
        // Because require() is relative to __dirname, not process.cwd()
        var nodeStylePath = require.resolve(module, {
            paths: [appRoot, moduleRoot],
        });
        return require(nodeStylePath);
    }
}
/**
 * Load the user's application or throw a descriptive error.
 * @throws Runtime errors in two cases
 *   1 - UserCodeSyntaxError if there's a syntax error while loading the module
 *   2 - ImportModuleError if the module cannot be found
 */
function _loadUserApp(appRoot, moduleRoot, module) {
    try {
        return _tryRequire(appRoot, moduleRoot, module);
    }
    catch (e) {
        if (e instanceof SyntaxError) {
            throw new errors_1.UserCodeSyntaxError(e);
            // @ts-ignore
        }
        else if (e.code !== undefined && e.code === "MODULE_NOT_FOUND") {
            // @ts-ignore
            throw new errors_1.ImportModuleError(e);
        }
        else {
            throw e;
        }
    }
}
function _throwIfInvalidHandler(fullHandlerString) {
    if (fullHandlerString.includes(RELATIVE_PATH_SUBSTRING)) {
        throw new errors_1.MalformedHandlerName("'".concat(fullHandlerString, "' is not a valid handler name. Use absolute paths when specifying root directories in handler names."));
    }
}
/**
 * Load the user's function with the approot and the handler string.
 * @param appRoot {string}
 *   The path to the application root.
 * @param handlerString {string}
 *   The user-provided handler function in the form 'module.function'.
 * @return userFuction {function}
 *   The user's handler function. This function will be passed the event body,
 *   the context object, and the callback function.
 * @throws In five cases:-
 *   1 - if the handler string is incorrectly formatted an error is thrown
 *   2 - if the module referenced by the handler cannot be loaded
 *   3 - if the function in the handler does not exist in the module
 *   4 - if a property with the same name, but isn't a function, exists on the
 *       module
 *   5 - the handler includes illegal character sequences (like relative paths
 *       for traversing up the filesystem '..')
 *   Errors for scenarios known by the runtime, will be wrapped by Runtime.* errors.
 */
var load = function (appRoot, fullHandlerString) {
    _throwIfInvalidHandler(fullHandlerString);
    var _a = __read(_moduleRootAndHandler(fullHandlerString), 2), moduleRoot = _a[0], moduleAndHandler = _a[1];
    var _b = __read(_splitHandlerString(moduleAndHandler), 2), module = _b[0], handlerPath = _b[1];
    var userApp = _loadUserApp(appRoot, moduleRoot, module);
    var handlerFunc = _resolveHandler(userApp, handlerPath);
    if (!handlerFunc) {
        throw new errors_1.HandlerNotFound("".concat(fullHandlerString, " is undefined or not exported"));
    }
    if (typeof handlerFunc !== "function") {
        throw new errors_1.HandlerNotFound("".concat(fullHandlerString, " is not a function"));
    }
    return handlerFunc;
};
exports.load = load;
//# sourceMappingURL=user-function.js.map