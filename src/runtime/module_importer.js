const Module = require("node:module");
const { dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");

const { logDebug, updateDDTags } = require("../utils");

const ddTraceLoaderPattern = /dd-trace[\\/](?:[^\s]*\.mjs|register\.js)/;

function esmLoaderAlreadyRegistered() {
    const nodeOptions = process.env.NODE_OPTIONS;
    if (nodeOptions !== undefined && ddTraceLoaderPattern.test(nodeOptions)) {
        return true;
    }

    for (const argument of process.execArgv) {
        if (ddTraceLoaderPattern.test(argument)) {
            return true;
        }
    }

    return false;
}

/**
 * @param {string} tracerPath
 */
function registerESMLoaderHooks(tracerPath) {
    if (typeof Module.register !== "function" || esmLoaderAlreadyRegistered()) {
        return;
    }

    const tracerDirectory = dirname(tracerPath);
    const registerPath = join(tracerDirectory, "register.js");
    try {
        try {
            require(registerPath);
        } catch (error) {
            const registerMissing = error?.code === "MODULE_NOT_FOUND" &&
                error.message?.startsWith(`Cannot find module '${registerPath}'`);
            if (!registerMissing) {
                throw error;
            }
            Module.register(pathToFileURL(join(tracerDirectory, "loader-hook.mjs")));
        }
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
    // The durable runtime ignores NODE_OPTIONS, so install hooks explicitly.
    registerESMLoaderHooks(tracerPath);
    return tracer;
}
