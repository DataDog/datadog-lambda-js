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
exports.unpatchHttp = exports.patchHttp = void 0;
var http_1 = __importDefault(require("http"));
var https_1 = __importDefault(require("https"));
var shimmer = __importStar(require("shimmer"));
var url_1 = require("url");
/**
 * Patches outgoing http calls to include DataDog's tracing headers.
 * @param contextService Provides up to date tracing context.
 */
function patchHttp(contextService) {
    patchMethod(http_1.default, "request", contextService);
    // In newer Node versions references internal to modules, such as `http(s).get` calling `http(s).request`, do
    // not use externally patched versions, which is why we need to also patch `get` here separately.
    patchMethod(http_1.default, "get", contextService);
    // Note, below Node v9, the `https` module invokes `http.request`. We choose to wrap both anyway, as it's safe
    // to invoke the patch handler twice.
    patchMethod(https_1.default, "request", contextService);
    patchMethod(https_1.default, "get", contextService);
}
exports.patchHttp = patchHttp;
/**
 * Removes http patching to add DataDog's tracing headers.
 */
function unpatchHttp() {
    unpatchMethod(http_1.default, "request");
    unpatchMethod(http_1.default, "get");
    unpatchMethod(https_1.default, "request");
    unpatchMethod(https_1.default, "get");
}
exports.unpatchHttp = unpatchHttp;
function patchMethod(mod, method, contextService) {
    shimmer.wrap(mod, method, function (original) {
        var fn = function (arg1, arg2, arg3) {
            var _a;
            _a = __read(addTraceContextToArgs(contextService, arg1, arg2, arg3), 3), arg1 = _a[0], arg2 = _a[1], arg3 = _a[2];
            if (arg3 === undefined || arg3 === null) {
                return original(arg1, arg2);
            }
            else {
                return original(arg1, arg2, arg3);
            }
        };
        return fn;
    });
}
function unpatchMethod(mod, method) {
    if (mod[method].__wrapped !== undefined) {
        shimmer.unwrap(mod, method);
    }
}
/**
 * Finds the RequestOptions in the args and injects context into headers
 */
function addTraceContextToArgs(contextService, arg1, arg2, arg3) {
    var requestOpts;
    if (typeof arg1 === "string" || arg1 instanceof url_1.URL) {
        if (arg2 === undefined || arg2 === null) {
            requestOpts = {
                method: "GET",
            };
            requestOpts = getRequestOptionsWithTraceContext(requestOpts, contextService);
            return [arg1, requestOpts, arg3];
        }
        else if (typeof arg2 === "function") {
            requestOpts = {
                method: "GET",
            };
            requestOpts = getRequestOptionsWithTraceContext(requestOpts, contextService);
            return [arg1, requestOpts, arg2];
        }
        else {
            requestOpts = arg2;
            requestOpts = getRequestOptionsWithTraceContext(requestOpts, contextService);
            return [arg1, requestOpts, arg3];
        }
    }
    else {
        requestOpts = getRequestOptionsWithTraceContext(arg1, contextService);
        return [requestOpts, arg2, arg3];
    }
}
function getRequestOptionsWithTraceContext(options, traceService) {
    var headers = options.headers;
    if (headers === undefined) {
        headers = {};
    }
    var traceHeaders = traceService.currentTraceHeaders;
    headers = __assign(__assign({}, headers), traceHeaders);
    var requestOpts = __assign(__assign({}, options), { headers: headers });
    // Logging all http requests during integration tests let's
    // us track traffic in our test snapshots
    if (isIntegrationTest()) {
        _logHttpRequest(requestOpts);
    }
    return requestOpts;
}
function isIntegrationTest() {
    var integrationTestEnvVar = process.env.DD_INTEGRATION_TEST;
    if (typeof integrationTestEnvVar !== "string") {
        return false;
    }
    return integrationTestEnvVar.toLowerCase() === "true";
}
/**
 * Log each HTTP request in this format for integration tests:
 * HTTP GET https://ip-ranges.datadoghq.com/ Headers: ["x-datadog-parent-id:abc"] Data: {}
 * @param options The options for the HTTP request
 */
function _logHttpRequest(options) {
    var headerMessage = "Headers: []";
    if (options.headers) {
        var headerStrings = Object.entries(options.headers).map(function (_a) {
            var _b = __read(_a, 2), name = _b[0], value = _b[1];
            return "".concat(name, ":").concat(value);
        });
        headerStrings.sort();
        headerMessage = "Headers: ".concat(JSON.stringify(headerStrings));
    }
    var url = "".concat(options.protocol, "//").concat(options.host || options.hostname).concat(options.path);
    var requestMessage = "HTTP ".concat(options.method, " ").concat(url, " ").concat(headerMessage, "\n");
    process.stdout.write(requestMessage);
}
//# sourceMappingURL=patch-http.js.map