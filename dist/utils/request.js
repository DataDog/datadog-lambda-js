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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = exports.post = void 0;
var https_1 = __importDefault(require("https"));
var http_1 = __importDefault(require("http"));
var log_1 = require("./log");
function post(url, body, options) {
    var bodyJSON = JSON.stringify(body);
    var buffer = Buffer.from(bodyJSON);
    (0, log_1.logDebug)("sending payload with body ".concat(bodyJSON));
    var requestOptions = __assign({ headers: { "content-type": "application/json" }, host: url.host, hostname: url.hostname, method: "POST", path: "".concat(url.pathname).concat(url.search), port: url.port, protocol: url.protocol }, options);
    return sendRequest(url, requestOptions, buffer);
}
exports.post = post;
function get(url, options) {
    var requestOptions = __assign({ headers: { "content-type": "application/json" }, host: url.host, hostname: url.hostname, method: "GET", path: "".concat(url.pathname).concat(url.search), port: url.port, protocol: url.protocol }, options);
    return sendRequest(url, requestOptions);
}
exports.get = get;
function sendRequest(url, options, buffer) {
    return new Promise(function (resolve) {
        var requestMethod = url.protocol === "https:" ? https_1.default.request : http_1.default.request;
        var request = requestMethod(options, function (response) {
            var statusCode = response.statusCode;
            if (statusCode === undefined || statusCode < 200 || statusCode > 299) {
                return resolve({
                    success: false,
                    statusCode: statusCode,
                    errorMessage: "HTTP error code: ".concat(response.statusCode),
                });
            }
            return resolve({
                success: true,
                statusCode: statusCode,
            });
        });
        request.on("error", function (error) {
            resolve({
                success: false,
                errorMessage: error.message,
            });
        });
        if (buffer) {
            request.write(buffer);
        }
        request.end();
    });
}
//# sourceMappingURL=request.js.map