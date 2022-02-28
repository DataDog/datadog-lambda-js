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
exports.handler = void 0;
var index_1 = require("./index");
var utils_1 = require("./utils");
var runtime_1 = require("./runtime");
if (process.env.DD_TRACE_DISABLED_PLUGINS === undefined) {
    process.env.DD_TRACE_DISABLED_PLUGINS = "fs";
    (0, utils_1.logDebug)("disabled the dd-trace plugin 'fs'");
}
if ((0, index_1.getEnvValue)("DD_TRACE_ENABLED", "true").toLowerCase() === "true") {
    // Looks for the function local version of dd-trace first, before using
    // the version provided by the layer
    var path = require.resolve("dd-trace", { paths: __spreadArray(["/var/task/node_modules"], __read(module.paths), false) });
    // tslint:disable-next-line:no-var-requires
    var tracer = require(path).init({
        tags: {
            "_dd.origin": "lambda",
        },
    });
    (0, utils_1.logDebug)("automatically initialized dd-trace");
    // Configure the tracer to ignore HTTP calls made from the Lambda Library to the Extension
    tracer.use("http", {
        blocklist: /:8124\/lambda/,
    });
}
var taskRootEnv = (0, index_1.getEnvValue)(index_1.lambdaTaskRootEnvVar, "");
var handlerEnv = (0, index_1.getEnvValue)(index_1.datadogHandlerEnvVar, "");
var extractorEnv = (0, index_1.getEnvValue)(index_1.traceExtractorEnvVar, "");
var traceExtractor;
if (extractorEnv) {
    try {
        traceExtractor = (0, runtime_1.load)(taskRootEnv, extractorEnv);
        (0, utils_1.logDebug)("loaded custom trace context extractor", { extractorEnv: extractorEnv });
    }
    catch (error) {
        (0, utils_1.logError)("an error occurred while loading the custom trace context extractor", { error: error, extractorEnv: extractorEnv });
    }
}
exports.handler = (0, index_1.datadog)((0, runtime_1.load)(taskRootEnv, handlerEnv), { traceExtractor: traceExtractor });
//# sourceMappingURL=handler.js.map