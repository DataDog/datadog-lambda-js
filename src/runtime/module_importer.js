
const { logDebug } = require("../utils");

// Currently no way to prevent typescript from auto-transpiling import into require,
// so we expose a wrapper in js
exports.import = function (path) {
    return import(path);
}

exports.loadTracer = function () {
    try {
        // Looks for the function local version of dd-trace first, before using
        // the version provided by the layer
        const path = require.resolve("dd-trace", { paths: ["/var/task/node_modules", ...module.paths] });
        // tslint:disable-next-line:no-var-requires
        return require(path);
    } catch (err) {
        if (err instanceof Object || err instanceof Error) {
            logDebug("Couldn't require dd-trace from main", err);
        }
    }
    return undefined;
}
