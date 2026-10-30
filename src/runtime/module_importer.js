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

// Mirrors isSyncLoaderHookVersionSupported from dd-trace's register.js. The
// nodejs/node#59929 fix that sync loader hooks rely on shipped in Node
// 22.22.3, 24.11.1, 25.1.0, and 26.0.0.
/**
 * @param {string} nodeVersion
 * @returns {boolean}
 */
function isSyncLoaderHookVersionSupported(nodeVersion) {
    const [major, minor, patch] = nodeVersion.split(".").map(Number);
    if (major >= 26) {
        return true;
    }
    if (major === 25) {
        return minor >= 1;
    }
    if (major === 24) {
        return minor > 11 || (minor === 11 && patch >= 1);
    }
    if (major === 22) {
        return minor > 22 || (minor === 22 && patch >= 3);
    }
    return false;
}

/**
 * Registration result for the synchronous, in-thread ESM loader hooks:
 * - "registered": hooks were installed in-thread.
 * - "unavailable": the sync path was not usable and nothing was installed;
 *   the caller may fall back to the asynchronous loader.
 * - "failed-after-load": loader-hook.mjs loaded but registerSyncLoaderHooks
 *   threw. The hooks may already be installed, so the caller must NOT fall
 *   back: we cannot tell whether registration ran, and double registration
 *   would run the rewriter on every module twice. Missing ESM instrumentation
 *   in this rare case matches the behavior before explicit registration was
 *   added.
 *
 * @typedef {"registered" | "unavailable" | "failed-after-load"} SyncRegistrationResult
 */

/**
 * Registers dd-trace's synchronous, in-thread ESM loader hooks. dd-trace's
 * register.js reaches these hooks through require(esm), which the Lambda
 * bootstrap disables with --no-experimental-require-module, while import()
 * is not affected.
 *
 * @param {string} tracerPath
 * @returns {Promise<SyncRegistrationResult>}
 */
async function registerSyncESMLoaderHooks(tracerPath) {
    if (typeof Module.registerHooks !== "function" || !exports.isSyncLoaderHookVersionSupported(process.versions.node)) {
        return "unavailable";
    }

    const loaderHookUrl = pathToFileURL(join(dirname(tracerPath), "loader-hook.mjs")).href;
    const loaderHookModule = await exports.import(loaderHookUrl);
    if (typeof loaderHookModule.registerSyncLoaderHooks !== "function") {
        return "unavailable";
    }
    try {
        return loaderHookModule.registerSyncLoaderHooks() === true ? "registered" : "unavailable";
    } catch (error) {
        logDebug(
            "dd-trace synchronous ESM loader hook registration threw; skipping the asynchronous loader to avoid registering hooks twice",
            { error },
        );
        return "failed-after-load";
    }
}

/**
 * @param {string} tracerPath
 */
async function registerESMLoaderHooksPreferSync(tracerPath) {
    if (typeof Module.register !== "function" || esmLoaderAlreadyRegistered()) {
        return;
    }

    let syncResult;
    try {
        syncResult = await registerSyncESMLoaderHooks(tracerPath);
    } catch (error) {
        // The dynamic import itself failed, so no hooks were installed.
        logDebug("failed to register dd-trace synchronous ESM loader hooks, falling back", { error });
        registerESMLoaderHooks(tracerPath);
        return;
    }
    if (syncResult === "registered") {
        logDebug("registered dd-trace synchronous ESM loader hooks");
        return;
    }
    if (syncResult === "failed-after-load") {
        return;
    }
    registerESMLoaderHooks(tracerPath);
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

exports.isSyncLoaderHookVersionSupported = isSyncLoaderHookVersionSupported;

exports.initTracer = async function () {
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
    await registerESMLoaderHooksPreferSync(tracerPath);
    return tracer;
}
