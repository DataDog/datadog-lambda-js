"use strict";
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToAPMParentID = exports.convertToAPMTraceID = exports.convertToSampleMode = exports.readStepFunctionContextFromEvent = exports.readTraceContextFromXray = exports.readTraceFromEvent = exports.readTraceFromHTTPEvent = exports.readTraceFromLambdaContext = exports.readTraceFromSNSEvent = exports.readTraceFromEventbridgeEvent = exports.readTraceFromKinesisEvent = exports.readTraceFromSNSSQSEvent = exports.readTraceFromSQSEvent = exports.readTraceFromAppSyncEvent = exports.sendXraySubsegment = exports.generateXraySubsegment = exports.addXrayMetadata = exports.addLambdaFunctionTagsToXray = exports.addStepFunctionContextToXray = exports.addTraceContextToXray = exports.extractTraceContext = void 0;
var bignumber_js_1 = require("bignumber.js");
var crypto_1 = require("crypto");
var dgram_1 = require("dgram");
var utils_1 = require("../utils");
var event_type_guards_1 = require("../utils/event-type-guards");
var constants_1 = require("./constants");
/**
 * Reads the trace context from either an incoming lambda event, or the current xray segment.
 * @param event An incoming lambda event. This must have incoming trace headers in order to be read.
 */
function extractTraceContext(event, context, extractor) {
    var trace;
    if (extractor) {
        try {
            trace = extractor(event, context);
            (0, utils_1.logDebug)("extracted trace context from the custom extractor", { trace: trace });
        }
        catch (error) {
            if (error instanceof Error) {
                (0, utils_1.logError)("custom extractor function failed", error);
            }
        }
    }
    if (!trace) {
        trace = readTraceFromEvent(event);
    }
    if (!trace) {
        trace = readTraceFromLambdaContext(context);
    }
    var stepFuncContext = readStepFunctionContextFromEvent(event);
    if (stepFuncContext) {
        try {
            addStepFunctionContextToXray(stepFuncContext);
        }
        catch (error) {
            if (error instanceof Error) {
                (0, utils_1.logError)("couldn't add step function metadata to xray", error);
            }
        }
    }
    if (trace !== undefined) {
        try {
            addTraceContextToXray(trace);
            (0, utils_1.logDebug)("added trace context to xray metadata", { trace: trace });
        }
        catch (error) {
            // This might fail if running in an environment where xray isn't set up, (like for local development).
            if (error instanceof Error) {
                (0, utils_1.logError)("couldn't add trace context to xray metadata", error);
            }
        }
        return trace;
    }
    return readTraceContextFromXray();
}
exports.extractTraceContext = extractTraceContext;
function addTraceContextToXray(traceContext) {
    var val = {
        "parent-id": traceContext.parentID,
        "sampling-priority": traceContext.sampleMode.toString(10),
        "trace-id": traceContext.traceID,
    };
    addXrayMetadata(constants_1.xraySubsegmentKey, val);
}
exports.addTraceContextToXray = addTraceContextToXray;
function addStepFunctionContextToXray(context) {
    addXrayMetadata(constants_1.xrayBaggageSubsegmentKey, context);
}
exports.addStepFunctionContextToXray = addStepFunctionContextToXray;
function addLambdaFunctionTagsToXray(triggerTags) {
    addXrayMetadata(constants_1.xrayLambdaFunctionTagsKey, triggerTags);
}
exports.addLambdaFunctionTagsToXray = addLambdaFunctionTagsToXray;
function addXrayMetadata(key, metadata) {
    var segment = generateXraySubsegment(key, metadata);
    if (segment === undefined) {
        return;
    }
    sendXraySubsegment(segment);
}
exports.addXrayMetadata = addXrayMetadata;
function generateXraySubsegment(key, metadata) {
    var _a, _b;
    var header = process.env[constants_1.xrayTraceEnvVar];
    if (header === undefined) {
        (0, utils_1.logDebug)("couldn't read xray trace header from env");
        return;
    }
    var context = parseXrayTraceContextHeader(header);
    if (context === undefined) {
        (0, utils_1.logDebug)("couldn't parse xray trace header from env");
        return;
    }
    var sampled = convertToSampleMode(parseInt(context.xraySampled, 10));
    if (sampled === constants_1.SampleMode.USER_REJECT || sampled === constants_1.SampleMode.AUTO_REJECT) {
        (0, utils_1.logDebug)("discarding xray metadata subsegment due to sampling");
        return;
    }
    // Convert from milliseconds to seconds
    var time = Date.now() * 0.001;
    return JSON.stringify({
        id: (0, crypto_1.randomBytes)(8).toString("hex"),
        trace_id: context.xrayTraceID,
        parent_id: context.xrayParentID,
        name: constants_1.xraySubsegmentName,
        start_time: time,
        end_time: time,
        type: "subsegment",
        metadata: (_a = {},
            _a[constants_1.xraySubsegmentNamespace] = (_b = {},
                _b[key] = metadata,
                _b),
            _a),
    });
}
exports.generateXraySubsegment = generateXraySubsegment;
function sendXraySubsegment(segment) {
    var xrayDaemonEnv = process.env[constants_1.awsXrayDaemonAddressEnvVar];
    if (xrayDaemonEnv === undefined) {
        (0, utils_1.logDebug)("X-Ray daemon env var not set, not sending sub-segment");
        return;
    }
    var parts = xrayDaemonEnv.split(":");
    if (parts.length <= 1) {
        (0, utils_1.logDebug)("X-Ray daemon env var has invalid format, not sending sub-segment");
        return;
    }
    var port = parseInt(parts[1], 10);
    var address = parts[0];
    var message = Buffer.from("{\"format\": \"json\", \"version\": 1}\n".concat(segment));
    var client;
    try {
        client = (0, dgram_1.createSocket)("udp4");
        // Send segment asynchronously to xray daemon
        client.send(message, 0, message.length, port, address, function (error, bytes) {
            client === null || client === void 0 ? void 0 : client.close();
            (0, utils_1.logDebug)("Xray daemon received metadata payload", { error: error, bytes: bytes });
        });
    }
    catch (error) {
        if (error instanceof Error) {
            client === null || client === void 0 ? void 0 : client.close();
            (0, utils_1.logDebug)("Error occurred submitting to xray daemon", error);
        }
    }
}
exports.sendXraySubsegment = sendXraySubsegment;
function readTraceFromAppSyncEvent(event) {
    event.headers = event.request.headers;
    return readTraceFromHTTPEvent(event);
}
exports.readTraceFromAppSyncEvent = readTraceFromAppSyncEvent;
function readTraceFromSQSEvent(event) {
    var _a, _b, _c, _d;
    if ((_d = (_c = (_b = (_a = event === null || event === void 0 ? void 0 : event.Records) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.messageAttributes) === null || _c === void 0 ? void 0 : _c._datadog) === null || _d === void 0 ? void 0 : _d.stringValue) {
        var traceHeaders = event.Records[0].messageAttributes._datadog.stringValue;
        try {
            var traceData = JSON.parse(traceHeaders);
            var traceID = traceData[constants_1.traceIDHeader];
            var parentID = traceData[constants_1.parentIDHeader];
            var sampledHeader = traceData[constants_1.samplingPriorityHeader];
            if (typeof traceID !== "string" || typeof parentID !== "string" || typeof sampledHeader !== "string") {
                return;
            }
            var sampleMode = parseInt(sampledHeader, 10);
            var trace = {
                parentID: parentID,
                sampleMode: sampleMode,
                source: constants_1.Source.Event,
                traceID: traceID,
            };
            (0, utils_1.logDebug)("extracted trace context from sqs event", { trace: trace, event: event });
            return trace;
        }
        catch (err) {
            if (err instanceof Error) {
                (0, utils_1.logError)("Error parsing SQS message trace data", err);
            }
            return;
        }
    }
    return;
}
exports.readTraceFromSQSEvent = readTraceFromSQSEvent;
function readTraceFromSNSSQSEvent(event) {
    var _a, _b;
    if ((_b = (_a = event === null || event === void 0 ? void 0 : event.Records) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.body) {
        try {
            var parsedBody = JSON.parse(event.Records[0].body);
            if (parsedBody.MessageAttributes &&
                parsedBody.MessageAttributes._datadog &&
                parsedBody.MessageAttributes._datadog.Value) {
                var traceData = JSON.parse(parsedBody.MessageAttributes._datadog.Value);
                var traceID = traceData[constants_1.traceIDHeader];
                var parentID = traceData[constants_1.parentIDHeader];
                var sampledHeader = traceData[constants_1.samplingPriorityHeader];
                if (typeof traceID !== "string" || typeof parentID !== "string" || typeof sampledHeader !== "string") {
                    return;
                }
                var sampleMode = parseInt(sampledHeader, 10);
                var trace = {
                    parentID: parentID,
                    sampleMode: sampleMode,
                    source: constants_1.Source.Event,
                    traceID: traceID,
                };
                (0, utils_1.logDebug)("extracted trace context from SNS SQS event", { trace: trace, event: event });
                return trace;
            }
        }
        catch (err) {
            if (err instanceof Error) {
                (0, utils_1.logError)("Error parsing SNS SQS message trace data", err);
            }
            return;
        }
    }
}
exports.readTraceFromSNSSQSEvent = readTraceFromSNSSQSEvent;
function readTraceFromKinesisEvent(event) {
    var _a, _b, _c;
    if ((_c = (_b = (_a = event === null || event === void 0 ? void 0 : event.Records) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.kinesis) === null || _c === void 0 ? void 0 : _c.data) {
        try {
            var parsedBody = JSON.parse(Buffer.from(event.Records[0].kinesis.data, "base64").toString("ascii"));
            if (parsedBody && parsedBody._datadog) {
                var traceData = parsedBody._datadog;
                var traceID = traceData[constants_1.traceIDHeader];
                var parentID = traceData[constants_1.parentIDHeader];
                var sampledHeader = traceData[constants_1.samplingPriorityHeader];
                if (typeof traceID !== "string" || typeof parentID !== "string" || typeof sampledHeader !== "string") {
                    return;
                }
                var sampleMode = parseInt(sampledHeader, 10);
                var trace = {
                    parentID: parentID,
                    sampleMode: sampleMode,
                    source: constants_1.Source.Event,
                    traceID: traceID,
                };
                (0, utils_1.logDebug)("extracted trace context from Kinesis event", { trace: trace });
                return trace;
            }
        }
        catch (err) {
            if (err instanceof Error) {
                (0, utils_1.logError)("Error parsing Kinesis message trace data", err);
            }
            return;
        }
    }
}
exports.readTraceFromKinesisEvent = readTraceFromKinesisEvent;
function readTraceFromEventbridgeEvent(event) {
    var _a;
    if ((_a = event === null || event === void 0 ? void 0 : event.detail) === null || _a === void 0 ? void 0 : _a._datadog) {
        try {
            var traceData = event.detail._datadog;
            var traceID = traceData[constants_1.traceIDHeader];
            var parentID = traceData[constants_1.parentIDHeader];
            var sampledHeader = traceData[constants_1.samplingPriorityHeader];
            if (typeof traceID !== "string" || typeof parentID !== "string" || typeof sampledHeader !== "string") {
                return;
            }
            var sampleMode = parseInt(sampledHeader, 10);
            var trace = {
                parentID: parentID,
                sampleMode: sampleMode,
                source: constants_1.Source.Event,
                traceID: traceID,
            };
            (0, utils_1.logDebug)("extracted trace context from Eventbridge event", { trace: trace, event: event });
            return trace;
        }
        catch (err) {
            if (err instanceof Error) {
                (0, utils_1.logError)("Error parsing Eventbridge trace data", err);
            }
            return;
        }
    }
}
exports.readTraceFromEventbridgeEvent = readTraceFromEventbridgeEvent;
function readTraceFromSNSEvent(event) {
    var _a, _b, _c, _d, _e;
    if ((_e = (_d = (_c = (_b = (_a = event === null || event === void 0 ? void 0 : event.Records) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.Sns) === null || _c === void 0 ? void 0 : _c.MessageAttributes) === null || _d === void 0 ? void 0 : _d._datadog) === null || _e === void 0 ? void 0 : _e.Value) {
        try {
            var traceData = JSON.parse(event.Records[0].Sns.MessageAttributes._datadog.Value);
            var traceID = traceData[constants_1.traceIDHeader];
            var parentID = traceData[constants_1.parentIDHeader];
            var sampledHeader = traceData[constants_1.samplingPriorityHeader];
            if (typeof traceID !== "string" || typeof parentID !== "string" || typeof sampledHeader !== "string") {
                return;
            }
            var sampleMode = parseInt(sampledHeader, 10);
            var trace = {
                parentID: parentID,
                sampleMode: sampleMode,
                source: constants_1.Source.Event,
                traceID: traceID,
            };
            (0, utils_1.logDebug)("extracted trace context from SNS event", { trace: trace, event: event });
            return trace;
        }
        catch (err) {
            if (err instanceof Error) {
                (0, utils_1.logError)("Error parsing SNS SQS message trace data", err);
            }
            return;
        }
    }
}
exports.readTraceFromSNSEvent = readTraceFromSNSEvent;
function readTraceFromLambdaContext(context) {
    var _a;
    if (!context || typeof context !== "object") {
        return;
    }
    var custom = (_a = context.clientContext) === null || _a === void 0 ? void 0 : _a.custom;
    if (!custom || typeof custom !== "object") {
        return;
    }
    var traceData = null;
    if (custom.hasOwnProperty("_datadog") &&
        typeof custom._datadog === "object" &&
        custom._datadog.hasOwnProperty(constants_1.traceIDHeader) &&
        custom._datadog.hasOwnProperty(constants_1.parentIDHeader) &&
        custom._datadog.hasOwnProperty(constants_1.samplingPriorityHeader)) {
        traceData = custom._datadog;
    }
    else if (custom.hasOwnProperty(constants_1.traceIDHeader) &&
        custom.hasOwnProperty(constants_1.parentIDHeader) &&
        custom.hasOwnProperty(constants_1.samplingPriorityHeader)) {
        traceData = custom;
    }
    else {
        return;
    }
    var traceID = traceData[constants_1.traceIDHeader];
    if (typeof traceID !== "string") {
        return;
    }
    var parentID = traceData[constants_1.parentIDHeader];
    if (typeof parentID !== "string") {
        return;
    }
    var sampledHeader = traceData[constants_1.samplingPriorityHeader];
    if (typeof sampledHeader !== "string") {
        return;
    }
    var sampleMode = parseInt(sampledHeader, 10);
    var trace = {
        parentID: parentID,
        sampleMode: sampleMode,
        source: constants_1.Source.Event,
        traceID: traceID,
    };
    (0, utils_1.logDebug)("extracted trace context from lambda context", { trace: trace, context: context });
    return trace;
}
exports.readTraceFromLambdaContext = readTraceFromLambdaContext;
function readTraceFromHTTPEvent(event) {
    var e_1, _a;
    var headers = event.headers;
    var lowerCaseHeaders = {};
    try {
        for (var _b = __values(Object.keys(headers)), _c = _b.next(); !_c.done; _c = _b.next()) {
            var key = _c.value;
            lowerCaseHeaders[key.toLowerCase()] = headers[key];
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
    var traceID = lowerCaseHeaders[constants_1.traceIDHeader];
    if (typeof traceID !== "string") {
        return;
    }
    var parentID = lowerCaseHeaders[constants_1.parentIDHeader];
    if (typeof parentID !== "string") {
        return;
    }
    var sampledHeader = lowerCaseHeaders[constants_1.samplingPriorityHeader];
    if (typeof sampledHeader !== "string") {
        return;
    }
    var sampleMode = parseInt(sampledHeader, 10);
    var trace = {
        parentID: parentID,
        sampleMode: sampleMode,
        source: constants_1.Source.Event,
        traceID: traceID,
    };
    (0, utils_1.logDebug)("extracted trace context from http event", { trace: trace, event: event });
    return trace;
}
exports.readTraceFromHTTPEvent = readTraceFromHTTPEvent;
function readTraceFromEvent(event) {
    if (!event || typeof event !== "object") {
        return;
    }
    if (event.headers !== null && typeof event.headers === "object") {
        return readTraceFromHTTPEvent(event);
    }
    if ((0, event_type_guards_1.isSNSEvent)(event)) {
        return readTraceFromSNSEvent(event);
    }
    if ((0, event_type_guards_1.isSNSSQSEvent)(event)) {
        return readTraceFromSNSSQSEvent(event);
    }
    if ((0, event_type_guards_1.isAppSyncResolverEvent)(event)) {
        return readTraceFromAppSyncEvent(event);
    }
    if ((0, event_type_guards_1.isSQSEvent)(event)) {
        return readTraceFromSQSEvent(event);
    }
    if ((0, event_type_guards_1.isKinesisStreamEvent)(event)) {
        return readTraceFromKinesisEvent(event);
    }
    if ((0, event_type_guards_1.isEventBridgeEvent)(event)) {
        return readTraceFromEventbridgeEvent(event);
    }
    return;
}
exports.readTraceFromEvent = readTraceFromEvent;
function readTraceContextFromXray() {
    var header = process.env[constants_1.xrayTraceEnvVar];
    if (header === undefined) {
        (0, utils_1.logDebug)("couldn't read xray trace header from env");
        return;
    }
    var context = parseXrayTraceContextHeader(header);
    if (context === undefined) {
        (0, utils_1.logError)("couldn't read xray trace context from env, variable had invalid format");
        return undefined;
    }
    var parentID = convertToAPMParentID(context.xrayParentID);
    if (parentID === undefined) {
        (0, utils_1.logDebug)("couldn't parse xray parent ID", context);
        return;
    }
    var traceID = convertToAPMTraceID(context.xrayTraceID);
    if (traceID === undefined) {
        (0, utils_1.logDebug)("couldn't parse xray trace ID", context);
        return;
    }
    var sampleMode = convertToSampleMode(parseInt(context.xraySampled, 10));
    var trace = {
        parentID: parentID,
        sampleMode: sampleMode,
        source: constants_1.Source.Xray,
        traceID: traceID,
    };
    (0, utils_1.logDebug)("extracted trace context from xray context", { trace: trace, header: header });
    return trace;
}
exports.readTraceContextFromXray = readTraceContextFromXray;
function parseXrayTraceContextHeader(header) {
    // Example: Root=1-5e272390-8c398be037738dc042009320;Parent=94ae789b969f1cc5;Sampled=1
    (0, utils_1.logDebug)("Reading trace context from env var ".concat(header));
    var _a = __read(header.split(";"), 3), root = _a[0], parent = _a[1], sampled = _a[2];
    if (parent === undefined || sampled === undefined) {
        return;
    }
    var _b = __read(root.split("="), 2), xrayTraceID = _b[1];
    var _c = __read(parent.split("="), 2), xrayParentID = _c[1];
    var _d = __read(sampled.split("="), 2), xraySampled = _d[1];
    if (xraySampled === undefined || xrayParentID === undefined || xrayTraceID === undefined) {
        return;
    }
    return {
        xrayTraceID: xrayTraceID,
        xraySampled: xraySampled,
        xrayParentID: xrayParentID,
    };
}
function readStepFunctionContextFromEvent(event) {
    if (typeof event !== "object") {
        return;
    }
    var dd = event.dd;
    if (typeof dd !== "object") {
        return;
    }
    var execution = dd.Execution;
    if (typeof execution !== "object") {
        return;
    }
    var executionID = execution.Name;
    if (typeof executionID !== "string") {
        return;
    }
    var state = dd.State;
    if (typeof state !== "object") {
        return;
    }
    var retryCount = state.RetryCount;
    if (typeof retryCount !== "number") {
        return;
    }
    var stepName = state.Name;
    if (typeof stepName !== "string") {
        return;
    }
    var stateMachine = dd.StateMachine;
    if (typeof stateMachine !== "object") {
        return;
    }
    var stateMachineArn = stateMachine.Id;
    if (typeof stateMachineArn !== "string") {
        return;
    }
    var stateMachineName = stateMachine.Name;
    if (typeof stateMachineName !== "string") {
        return;
    }
    return {
        "step_function.execution_id": executionID,
        "step_function.retry_count": retryCount,
        "step_function.state_machine_arn": stateMachineArn,
        "step_function.state_machine_name": stateMachineName,
        "step_function.step_name": stepName,
    };
}
exports.readStepFunctionContextFromEvent = readStepFunctionContextFromEvent;
function convertToSampleMode(xraySampled) {
    return xraySampled === 1 ? constants_1.SampleMode.USER_KEEP : constants_1.SampleMode.USER_REJECT;
}
exports.convertToSampleMode = convertToSampleMode;
function convertToAPMTraceID(xrayTraceID) {
    var parts = xrayTraceID.split("-");
    if (parts.length < 3) {
        return;
    }
    var lastPart = parts[2];
    if (lastPart.length !== 24) {
        return;
    }
    // We want to turn the last 63 bits into a decimal number in a string representation
    // Unfortunately, all numbers in javascript are represented by float64 bit numbers, which
    // means we can't parse 64 bit integers accurately.
    var hex = new bignumber_js_1.BigNumber(lastPart, 16);
    if (hex.isNaN()) {
        return;
    }
    // Toggle off the 64th bit
    var last63Bits = hex.mod(new bignumber_js_1.BigNumber("8000000000000000", 16));
    return last63Bits.toString(10);
}
exports.convertToAPMTraceID = convertToAPMTraceID;
function convertToAPMParentID(xrayParentID) {
    if (xrayParentID.length !== 16) {
        return;
    }
    var hex = new bignumber_js_1.BigNumber(xrayParentID, 16);
    if (hex.isNaN()) {
        return;
    }
    return hex.toString(10);
}
exports.convertToAPMParentID = convertToAPMParentID;
//# sourceMappingURL=context.js.map