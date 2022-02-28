"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeMetricToStdout = exports.buildMetricLog = void 0;
// Builds the string representation of the metric that will be written to logs
function buildMetricLog(name, value, metricTime, tags) {
    return "".concat(JSON.stringify({
        // Date.now() returns Unix time in milliseconds, we convert to seconds for DD API submission
        e: metricTime.getTime() / 1000,
        m: name,
        t: tags,
        v: value,
    }), "\n");
}
exports.buildMetricLog = buildMetricLog;
/**
 * Writes the specified metric to standard output
 * @param name The name of the metric
 * @param value Metric datapoint's value
 * @param tags Tags to apply to the metric
 */
function writeMetricToStdout(name, value, metricTime, tags) {
    // We use process.stdout.write, because console.log will prepend metadata to the start
    // of the log that log forwarder doesn't know how to read.
    process.stdout.write(buildMetricLog(name, value, metricTime, tags));
}
exports.writeMetricToStdout = writeMetricToStdout;
//# sourceMappingURL=metric-log.js.map