
const { logDebug, updateDDTags } = require("../utils");

function compileCache () {
    const { FileSystemBlobStore, NativeCompileCache } = require('v8-compile-cache').__TEST__

    const cacheDir = __dirname
    const prefix = 'module_importer'
    const blobStore = new FileSystemBlobStore(cacheDir, prefix)

    const nativeCompileCache = new NativeCompileCache()
    nativeCompileCache.setCacheStore(blobStore)
    nativeCompileCache.install()

    process.once('exit', () => {
        if (blobStore.isDirty()) {
            blobStore.save()
        }
        nativeCompileCache.uninstall()
    })
}

// Currently no way to prevent typescript from auto-transpiling import into require,
// so we expose a wrapper in js
exports.import = function (path) {
    return import(path);
}

exports.initTracer = function () {
    compileCache()

    // Looks for the function local version of dd-trace first, before using
    // the version provided by the layer
    const path = require.resolve("dd-trace", { paths: ["/var/task/node_modules", ...module.paths] });
    // tslint:disable-next-line:no-var-requires
    // add lambda tags to DD_TAGS environment variable
    const ddtags = updateDDTags({"_dd.origin": "lambda"})
    const tracer = require(path).init({tags: ddtags});
    logDebug("automatically initialized dd-trace");

    // Configure the tracer to ignore HTTP calls made from the Lambda Library to the Extension
    tracer.use("http", {
        blocklist: /:8124\/lambda/,
    });
    return tracer;
}
