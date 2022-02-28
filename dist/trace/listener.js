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
exports.TraceListener = void 0;
var context_1 = require("./context");
var patch_http_1 = require("./patch-http");
var trace_context_service_1 = require("./trace-context-service");
var trigger_1 = require("./trigger");
var utils_1 = require("../utils");
var cold_start_1 = require("../utils/cold-start");
var constants_1 = require("../constants");
var constants_2 = require("./constants");
var patch_console_1 = require("./patch-console");
var tracer_wrapper_1 = require("./tracer-wrapper");
var span_inferrer_1 = require("./span-inferrer");
var span_wrapper_1 = require("./span-wrapper");
var TraceListener = /** @class */ (function () {
    function TraceListener(config) {
        this.config = config;
        this.tracerWrapper = new tracer_wrapper_1.TracerWrapper();
        this.contextService = new trace_context_service_1.TraceContextService(this.tracerWrapper);
        this.inferrer = new span_inferrer_1.SpanInferrer(this.tracerWrapper);
    }
    Object.defineProperty(TraceListener.prototype, "currentTraceHeaders", {
        get: function () {
            return this.contextService.currentTraceHeaders;
        },
        enumerable: false,
        configurable: true
    });
    TraceListener.prototype.onStartInvocation = function (event, context) {
        var _a, _b;
        var tracerInitialized = this.tracerWrapper.isTracerAvailable;
        if (this.config.injectLogContext) {
            (0, patch_console_1.patchConsole)(console, this.contextService);
            (0, utils_1.logDebug)("Patched console output with trace context");
        }
        else {
            (0, utils_1.logDebug)("Didn't patch console output with trace context");
        }
        // If the DD tracer is initialized then it's doing http patching so we don't again here
        if (this.config.autoPatchHTTP && !tracerInitialized) {
            (0, utils_1.logDebug)("Patching HTTP libraries");
            (0, patch_http_1.patchHttp)(this.contextService);
        }
        else {
            (0, utils_1.logDebug)("Not patching HTTP libraries", { autoPatchHTTP: this.config.autoPatchHTTP, tracerInitialized: tracerInitialized });
        }
        var rootTraceHeaders = this.contextService.extractHeadersFromContext(event, context, this.config.traceExtractor);
        // The aws.lambda span needs to have a parented to the Datadog trace context from the
        // incoming event if available or the X-Ray trace context if hybrid tracing is enabled
        var parentSpanContext;
        if (this.contextService.traceSource === constants_2.Source.Event || this.config.mergeDatadogXrayTraces) {
            parentSpanContext = rootTraceHeaders ? (_a = this.tracerWrapper.extract(rootTraceHeaders)) !== null && _a !== void 0 ? _a : undefined : undefined;
            (0, utils_1.logDebug)("Attempting to find parent for the aws.lambda span");
        }
        else {
            (0, utils_1.logDebug)("Didn't attempt to find parent for aws.lambda span", {
                mergeDatadogXrayTraces: this.config.mergeDatadogXrayTraces,
                traceSource: this.contextService.traceSource,
            });
        }
        if (this.config.createInferredSpan) {
            this.inferredSpan = this.inferrer.createInferredSpan(event, context, parentSpanContext);
        }
        this.lambdaSpanParentContext = ((_b = this.inferredSpan) === null || _b === void 0 ? void 0 : _b.span) || parentSpanContext;
        this.context = context;
        this.triggerTags = (0, trigger_1.extractTriggerTags)(event, context);
        this.stepFunctionContext = (0, context_1.readStepFunctionContextFromEvent)(event);
    };
    /**
     * onEndingInvocation runs after the user function has returned
     * but before the wrapped function has returned
     * this is needed to apply tags to the lambda span
     * before it is flushed to logs or extension
     *
     * @param event
     * @param result
     * @param shouldTagPayload
     */
    TraceListener.prototype.onEndingInvocation = function (event, result, shouldTagPayload) {
        if (shouldTagPayload === void 0) { shouldTagPayload = false; }
        // Guard clause if something has gone horribly wrong
        // so we won't crash user code.
        if (!this.tracerWrapper.currentSpan)
            return;
        this.wrappedCurrentSpan = new span_wrapper_1.SpanWrapper(this.tracerWrapper.currentSpan, {});
        if (shouldTagPayload) {
            (0, utils_1.tagObject)(this.tracerWrapper.currentSpan, "function.request", event);
            (0, utils_1.tagObject)(this.tracerWrapper.currentSpan, "function.response", result);
        }
        if (this.triggerTags) {
            var statusCode = (0, trigger_1.extractHTTPStatusCodeTag)(this.triggerTags, result);
            var errorMessage = this.triggerTags['error.message'];
            // Store the status tag in the listener to send to Xray on invocation completion
            this.triggerTags["http.status_code"] = statusCode;
            if (this.tracerWrapper.currentSpan) {
                this.tracerWrapper.currentSpan.setTag("http.status_code", statusCode);
            }
            if (this.inferredSpan) {
                this.inferredSpan.setTag("http.status_code", statusCode);
                if (errorMessage) {
                    this.inferredSpan.setTag('error.message', errorMessage);
                }
            }
        }
    };
    TraceListener.prototype.onCompleteInvocation = function () {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var tracerInitialized, finishTime;
            return __generator(this, function (_b) {
                // Create a new dummy Datadog subsegment for function trigger tags so we
                // can attach them to X-Ray spans when hybrid tracing is used
                if (this.triggerTags) {
                    (0, context_1.addLambdaFunctionTagsToXray)(this.triggerTags);
                }
                tracerInitialized = this.tracerWrapper.isTracerAvailable;
                if (this.config.autoPatchHTTP && !tracerInitialized) {
                    (0, utils_1.logDebug)("Unpatching HTTP libraries");
                    (0, patch_http_1.unpatchHttp)();
                }
                if (this.inferredSpan) {
                    (0, utils_1.logDebug)("Finishing inferred span");
                    finishTime = this.inferredSpan.isAsync() ? (_a = this.wrappedCurrentSpan) === null || _a === void 0 ? void 0 : _a.startTime() : Date.now();
                    this.inferredSpan.finish(finishTime);
                }
                return [2 /*return*/];
            });
        });
    };
    TraceListener.prototype.onWrap = function (func) {
        var _a, _b, _c;
        var options = {};
        if (this.context) {
            (0, utils_1.logDebug)("Creating the aws.lambda span");
            var functionArn = ((_a = this.context.invokedFunctionArn) !== null && _a !== void 0 ? _a : "").toLowerCase();
            var tk = functionArn.split(":");
            options.tags = {
                cold_start: (0, cold_start_1.didFunctionColdStart)(),
                function_arn: tk.length > 7 ? tk.slice(0, 7).join(":") : functionArn,
                function_version: tk.length > 7 ? tk[7] : "$LATEST",
                request_id: this.context.awsRequestId,
                resource_names: this.context.functionName,
                functionname: (_c = (_b = this.context) === null || _b === void 0 ? void 0 : _b.functionName) === null || _c === void 0 ? void 0 : _c.toLowerCase(),
                datadog_lambda: constants_1.datadogLambdaVersion,
                dd_trace: constants_2.ddtraceVersion,
            };
            if ((this.contextService.traceSource === constants_2.Source.Xray && this.config.mergeDatadogXrayTraces) ||
                this.contextService.traceSource === constants_2.Source.Event) {
                options.tags["_dd.parent_source"] = this.contextService.traceSource;
            }
            if (this.triggerTags) {
                options.tags = __assign(__assign({}, options.tags), this.triggerTags);
            }
        }
        if (this.stepFunctionContext) {
            (0, utils_1.logDebug)("Applying step function context to the aws.lambda span");
            options.tags = __assign(__assign({}, options.tags), this.stepFunctionContext);
        }
        if (this.lambdaSpanParentContext) {
            options.childOf = this.lambdaSpanParentContext;
        }
        options.type = "serverless";
        options.service = "aws.lambda";
        if (this.context) {
            options.resource = this.context.functionName;
        }
        return this.tracerWrapper.wrap("aws.lambda", options, func);
    };
    return TraceListener;
}());
exports.TraceListener = TraceListener;
//# sourceMappingURL=listener.js.map