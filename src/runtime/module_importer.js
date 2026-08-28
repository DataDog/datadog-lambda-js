const Module = require("node:module");
const { dirname, join } = require("node:path");

const { logDebug, updateDDTags } = require("../utils");

function esmLoaderAlreadyRegistered() {
    const sources = [process.env.NODE_OPTIONS || "", ...process.execArgv];
    return sources.some((source) => /dd-trace[\\/](?:[^\s]*\.mjs|register\.js)/.test(source));
}

/**
 * @param {string[]} searchPaths
 */
function registerESMLoaderHooks(searchPaths) {
    if (typeof Module.register !== "function" || esmLoaderAlreadyRegistered()) {
        return;
    }

    try {
        const packagePath = require.resolve("dd-trace/package.json", { paths: searchPaths });
        const registerPath = join(dirname(packagePath), "register.js");
        require(registerPath);
        logDebug("registered dd-trace ESM loader hooks for ESM instrumentation");
    } catch (error) {
        logDebug("failed to register dd-trace ESM loader hooks", { error });
    }
}

// Currently no way to prevent typescript from auto-transpiling import into require,
// so we expose a wrapper in js
exports.import = function (path) {
    return import(path);
}

exports.initTracer = function () {
    // Looks for the function local version of dd-trace first, before using
    // the version provided by the layer
    const searchPaths = ["/var/task/node_modules", ...module.paths];
    const tracerPath = require.resolve("dd-trace", { paths: searchPaths });
    // tslint:disable-next-line:no-var-requires
    // add lambda tags to DD_TAGS environment variable
    const ddtags = updateDDTags({"_dd.origin": "lambda"})
    const tracer = require(tracerPath).init({tags: ddtags});
    logDebug("automatically initialized dd-trace");

    // Configure the tracer to ignore HTTP calls made from the Lambda Library to the Extension
    tracer.use("http", {
        blocklist: /:8124\/lambda/,
    });
    // The durable runtime ignores NODE_OPTIONS, so install hooks from the same
    // function-local package that initialized the tracer.
    registerESMLoaderHooks(searchPaths);
    return tracer;
}
