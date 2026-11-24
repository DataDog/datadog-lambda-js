const Module = require("node:module");
const { dirname, join } = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");

const { logDebug, updateDDTags } = require("../utils");

let loaderRegistration;

function preloadPaths(arguments_, flags) {
    const paths = [];
    for (let index = 0; index < arguments_.length; index++) {
        const argument = arguments_[index];
        const separator = argument.indexOf("=");
        const flag = separator === -1 ? argument : argument.slice(0, separator);
        if (!flags.includes(flag)) continue;
        const value = separator === -1 ? arguments_[++index] : argument.slice(separator + 1);
        if (value !== undefined) paths.push(value.replace(/^"|"$/g, ""));
    }
    return paths;
}

function isSelectedLoader(specifier, tracerDirectory, filename) {
    try {
        const path = specifier.startsWith("file:") ? fileURLToPath(specifier) : specifier;
        return require.resolve(path, { paths: [process.cwd()] }) === join(tracerDirectory, filename);
    } catch {
        return false;
    }
}

/**
 * @param {string} tracerPath
 */
async function registerESMLoaderHooks(tracerPath) {
    if (typeof Module.registerHooks !== "function" && typeof Module.register !== "function") {
        return;
    }

    const tracerDirectory = dirname(tracerPath);
    const registerPath = join(tracerDirectory, "register.js");
    const nodeOptions = process.env.NODE_OPTIONS?.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const arguments_ = [...nodeOptions, ...process.execArgv];
    const loaders = preloadPaths(arguments_, ["--loader", "--experimental-loader"]);
    if (loaders.some((specifier) => ["loader-hook.mjs", "initialize.mjs"].some(
        (filename) => isSelectedLoader(specifier, tracerDirectory, filename),
    ))) return;

    const imports = preloadPaths(arguments_, ["--import"]);
    try {
        if (imports.some((specifier) => isSelectedLoader(specifier, tracerDirectory, "initialize.mjs"))) {
            await import(/* webpackIgnore: true */ pathToFileURL(join(tracerDirectory, "initialize.mjs")).href);
            return;
        }
        // Resolve before importing: a missing dependency inside register.mjs must not
        // be mistaken for an older tracer without this entry point.
        let esmRegisterPath;
        try {
            esmRegisterPath = require.resolve(join(tracerDirectory, "register.mjs"));
        } catch (error) {
            if (error?.code !== "MODULE_NOT_FOUND") throw error;
        }
        if (esmRegisterPath) {
            // Native import works when Lambda disables require(esm). Await hook
            // installation before the extractor or customer handler is evaluated.
            await import(/* webpackIgnore: true */ pathToFileURL(esmRegisterPath).href);
            logDebug("registered dd-trace ESM loader hooks for ESM instrumentation");
            return;
        }
        if (require.cache[registerPath]?.loaded) return;
        try {
            require(registerPath);
        } catch (error) {
            const registerMissing = error?.code === "MODULE_NOT_FOUND" &&
                error.message?.startsWith(`Cannot find module '${registerPath}'`);
            if (!registerMissing) {
                throw error;
            }
            if (typeof Module.register === "function") {
                Module.register(pathToFileURL(join(tracerDirectory, "loader-hook.mjs")));
            } else {
                return;
            }
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
    loaderRegistration ||= registerESMLoaderHooks(tracerPath);
    await loaderRegistration;
    return tracer;
}
