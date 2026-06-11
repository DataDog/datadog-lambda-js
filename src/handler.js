// CJS entry used by AWS Lambda's bootstrap when the handler string resolves
// to `node_modules/datadog-lambda-js/dist/handler.handler` from the published
// npm package. Lambda's resolver picks `.js` before `.mjs`, so this file is
// what gets loaded for both CJS and ESM user functions. We branch at runtime:
//
//   - CJS user code: synchronously load and wrap the handler in-place (the
//     prior fast-path behavior, formerly delegated to handler.cjs).
//
//   - ESM user code: expose an async handler that lazily `import()`s
//     handler.mjs on the first invocation. handler.mjs's async `load()`
//     transparently handles both CJS and ESM user modules, so this is what
//     fixes the ERR_REQUIRE_ESM failure mode reported in
//     https://github.com/DataDog/datadog-lambda-js/issues/782.
//
// In the published layer this file is removed by the Dockerfile so Lambda's
// resolver falls through to handler.mjs directly.

"use strict";

const fs = require("fs");
const path = require("path");

function shouldUseEsmHandler() {
  const handlerEnv = process.env.DD_LAMBDA_HANDLER || process.env._HANDLER || "";
  if (/\.mjs(\..*)?$/.test(handlerEnv)) {
    return true;
  }

  const taskRoot = process.env.LAMBDA_TASK_ROOT || process.cwd();
  try {
    const pkgPath = path.join(taskRoot, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg && pkg.type === "module") {
      return true;
    }
  } catch (_) {
    // package.json missing or unreadable — assume CJS, matches prior behavior.
  }

  return false;
}

// Exported for unit tests. Not part of the public surface.
exports._shouldUseEsmHandler = shouldUseEsmHandler;

if (shouldUseEsmHandler()) {
  let cachedHandler;
  let cachedError;

  exports.handler = async function ddEsmHandler(event, context) {
    if (cachedError) {
      throw cachedError;
    }
    if (!cachedHandler) {
      try {
        const mod = await import("./handler.mjs");
        cachedHandler = mod.handler;
      } catch (error) {
        cachedError = error;
        throw error;
      }
    }
    return cachedHandler(event, context);
  };
} else {
  // Inlined former handler.cjs body. Lambda's resolver doesn't auto-resolve
  // `.cjs` for the handler string, so handler.cjs was only ever reachable
  // via the shim's `require("./handler.cjs")` — keeping it as a separate
  // file made the load graph confusing. Requires are scoped to this branch
  // so ESM users don't pay the cost of pulling in the full tracer at
  // require-time when they only need handler.mjs.
  const {
    datadog,
    datadogHandlerEnvVar,
    lambdaTaskRootEnvVar,
    traceExtractorEnvVar,
    emitTelemetryOnErrorOutsideHandler,
    getEnvValue,
  } = require("./index.js");
  const { logDebug, logError } = require("./utils/index.js");
  const { loadSync } = require("./runtime/index.js");
  const { initTracer } = require("./runtime/module_importer");

  if (process.env.DD_TRACE_DISABLED_PLUGINS === undefined) {
    process.env.DD_TRACE_DISABLED_PLUGINS = "fs";
    logDebug("disabled the dd-trace plugin 'fs'");
  }

  if (getEnvValue("DD_TRACE_ENABLED", "true").toLowerCase() === "true") {
    initTracer();
  }

  const taskRootEnv = getEnvValue(lambdaTaskRootEnvVar, "");
  const handlerEnv = getEnvValue(datadogHandlerEnvVar, "");
  const extractorEnv = getEnvValue(traceExtractorEnvVar, "");
  let traceExtractor;

  if (extractorEnv) {
    try {
      traceExtractor = loadSync(taskRootEnv, extractorEnv);
      logDebug("loaded custom trace context extractor", { extractorEnv });
    } catch (error) {
      logError("an error occurred while loading the custom trace context extractor", { error, extractorEnv });
    }
  }

  try {
    exports.handler = datadog(loadSync(taskRootEnv, handlerEnv), { traceExtractor });
  } catch (error) {
    emitTelemetryOnErrorOutsideHandler(error, handlerEnv, Date.now()).catch(
      logDebug("failed to error telemetry on error outside handler"),
    );
    throw error;
  }
}
