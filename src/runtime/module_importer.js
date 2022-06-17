
const { logDebug } = require("../utils");

// Currently no way to prevent typescript from auto-transpiling import into require,
// so we expose a wrapper in js
exports.import = function (path) {
    return import(path);
}

exports.initTracer = function () {
    // Looks for the function local version of dd-trace first, before using
    // the version provided by the layer
    const path = require.resolve("dd-trace", { paths: ["/var/task/node_modules", ...module.paths] });
    // tslint:disable-next-line:no-var-requires
    const tracer = require(path).init({
        tags: {
            "_dd.origin": "lambda",
        },
    });
    logDebug("automatically initialized dd-trace");

    // Configure the tracer to ignore HTTP calls made from the Lambda Library to the Extension
    tracer.use("http", {
        blocklist: /:8124\/lambda/,
    });
    return tracer;
}