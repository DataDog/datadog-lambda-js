"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiGatewayEventV2 = exports.ddtraceVersion = exports.awsXrayDaemonAddressEnvVar = exports.xrayTraceEnvVar = exports.xraySubsegmentNamespace = exports.xrayLambdaFunctionTagsKey = exports.xrayBaggageSubsegmentKey = exports.xraySubsegmentKey = exports.xraySubsegmentName = exports.samplingPriorityHeader = exports.parentIDHeader = exports.traceIDHeader = exports.Source = exports.SampleMode = void 0;
var SampleMode;
(function (SampleMode) {
    SampleMode[SampleMode["USER_REJECT"] = -1] = "USER_REJECT";
    SampleMode[SampleMode["AUTO_REJECT"] = 0] = "AUTO_REJECT";
    SampleMode[SampleMode["AUTO_KEEP"] = 1] = "AUTO_KEEP";
    SampleMode[SampleMode["USER_KEEP"] = 2] = "USER_KEEP";
})(SampleMode = exports.SampleMode || (exports.SampleMode = {}));
var Source;
(function (Source) {
    Source["Xray"] = "xray";
    Source["Event"] = "event";
    Source["DDTrace"] = "ddtrace";
})(Source = exports.Source || (exports.Source = {}));
exports.traceIDHeader = "x-datadog-trace-id";
exports.parentIDHeader = "x-datadog-parent-id";
exports.samplingPriorityHeader = "x-datadog-sampling-priority";
exports.xraySubsegmentName = "datadog-metadata";
exports.xraySubsegmentKey = "trace";
exports.xrayBaggageSubsegmentKey = "root_span_metadata";
exports.xrayLambdaFunctionTagsKey = "lambda_function_tags";
exports.xraySubsegmentNamespace = "datadog";
exports.xrayTraceEnvVar = "_X_AMZN_TRACE_ID";
exports.awsXrayDaemonAddressEnvVar = "AWS_XRAY_DAEMON_ADDRESS";
exports.ddtraceVersion = "";
exports.apiGatewayEventV2 = "2.0";
//# sourceMappingURL=constants.js.map
