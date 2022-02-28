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
exports.TraceContextService = void 0;
var utils_1 = require("../utils");
var constants_1 = require("./constants");
var context_1 = require("./context");
/**
 * Service for retrieving the latest version of the request context from xray.
 */
var TraceContextService = /** @class */ (function () {
    function TraceContextService(tracerWrapper) {
        this.tracerWrapper = tracerWrapper;
    }
    TraceContextService.prototype.extractHeadersFromContext = function (event, context, extractor) {
        this.rootTraceContext = (0, context_1.extractTraceContext)(event, context, extractor);
        return this.currentTraceHeaders;
    };
    Object.defineProperty(TraceContextService.prototype, "currentTraceContext", {
        get: function () {
            if (this.rootTraceContext === undefined) {
                return;
            }
            var traceContext = __assign({}, this.rootTraceContext);
            // Update the parent id to the active datadog span if available
            var datadogContext = this.tracerWrapper.traceContext();
            if (datadogContext) {
                (0, utils_1.logDebug)("set trace context from dd-trace with parent ".concat(datadogContext.parentID));
                return datadogContext;
            }
            return traceContext;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(TraceContextService.prototype, "currentTraceHeaders", {
        // Get the current trace headers to be propagated to the downstream calls,
        // The parent id always points to the current active span.
        get: function () {
            var _a;
            var traceContext = this.currentTraceContext;
            if (traceContext === undefined) {
                return {};
            }
            return _a = {},
                _a[constants_1.traceIDHeader] = traceContext.traceID,
                _a[constants_1.parentIDHeader] = traceContext.parentID,
                _a[constants_1.samplingPriorityHeader] = traceContext.sampleMode.toString(10),
                _a;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(TraceContextService.prototype, "rootTraceHeaders", {
        // Get the trace headers from the root trace context.
        get: function () {
            var _a;
            var rootTraceContext = this.rootTraceContext;
            if (rootTraceContext === undefined) {
                return {};
            }
            return _a = {},
                _a[constants_1.traceIDHeader] = rootTraceContext.traceID,
                _a[constants_1.parentIDHeader] = rootTraceContext.parentID,
                _a[constants_1.samplingPriorityHeader] = rootTraceContext.sampleMode.toString(10),
                _a;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(TraceContextService.prototype, "traceSource", {
        get: function () {
            return this.rootTraceContext !== undefined ? this.rootTraceContext.source : undefined;
        },
        enumerable: false,
        configurable: true
    });
    return TraceContextService;
}());
exports.TraceContextService = TraceContextService;
//# sourceMappingURL=trace-context-service.js.map