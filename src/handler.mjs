import * as Module from "module";
import { dirname } from "path";
import { pathToFileURL } from "url";
import {
  datadog,
  datadogHandlerEnvVar,
  lambdaTaskRootEnvVar,
  traceExtractorEnvVar,
  getEnvValue,
  emitTelemetryOnErrorOutsideHandler,
} from "./index.js";
import { logDebug, logError } from "./utils/index.js";
import { load } from "./runtime/index.js";
import { initTracer } from "./runtime/module_importer.js";

if (process.env.DD_TRACE_DISABLED_PLUGINS === undefined) {
  process.env.DD_TRACE_DISABLED_PLUGINS = "fs";
  logDebug("disabled the dd-trace plugin 'fs'");
}

if (process.env.DD_TRACE_STARTUP_LOGS === undefined) {
  process.env.DD_TRACE_STARTUP_LOGS = "false";
  logDebug("disabled dd-trace startup logs");
}

// True when dd-trace's ESM loader hook is already active via NODE_OPTIONS or
// execArgv. Covers every preload entry point that registers the hook:
//   --import dd-trace/initialize.mjs  (documented ESM setup)
//   --loader dd-trace/initialize.mjs  (legacy)
//   --require dd-trace/register.js    (documented CJS setup; also registers the hook)
// module.register() does not dedupe — a second registration chains another hooks
// worker and every module would be rewritten twice.
function esmLoaderAlreadyRegistered() {
  const sources = [process.env.NODE_OPTIONS || "", ...process.execArgv];
  return sources.some((source) => /dd-trace[\\/](?:[^\s]*\.mjs|register\.js)/.test(source));
}

if (getEnvValue("DD_TRACE_ENABLED", "true").toLowerCase() === "true") {
  const tracer = initTracer();

  // Register dd-trace's ESM loader hooks programmatically so that ESM imports
  // (e.g. @aws/durable-execution-sdk-js) are rewritten for instrumentation.
  // Normally this happens via --import dd-trace/initialize.mjs, but the AWS
  // durable runtime ignores NODE_OPTIONS so the loader is never registered.
  // This mirrors what dd-trace/initialize.mjs does at lines 77-84, including
  // only registering when the tracer initialized — a bail-out leaves the hooks
  // worker with nothing to instrument and can keep the process from exiting.
  if (tracer && typeof Module.register === "function" && !esmLoaderAlreadyRegistered()) {
    try {
      const require = Module.createRequire(import.meta.url);
      const ddTraceEntry = require.resolve("dd-trace", {
        paths: ["/var/task/node_modules", ...(require.resolve.paths("dd-trace") || [])],
      });
      const ddTraceRoot = pathToFileURL(dirname(ddTraceEntry) + "/").href;
      Module.register("./loader-hook.mjs", ddTraceRoot);
      logDebug("registered dd-trace ESM loader hook for ESM instrumentation");
    } catch (error) {
      logDebug("failed to register dd-trace ESM loader hook", { error });
    }
  }
}

const taskRootEnv = getEnvValue(lambdaTaskRootEnvVar, "");
const handlerEnv = getEnvValue(datadogHandlerEnvVar, "");
const extractorEnv = getEnvValue(traceExtractorEnvVar, "");
let traceExtractor;

if (extractorEnv) {
  try {
    traceExtractor = await load(taskRootEnv, extractorEnv);
    logDebug("loaded custom trace context extractor", { extractorEnv });
  } catch (error) {
    logError("an error occurred while loading the custom trace context extractor", { error, extractorEnv });
  }
}

let wrappedHandler;
try {
  wrappedHandler = datadog(await load(taskRootEnv, handlerEnv), { traceExtractor });
} catch (error) {
  await emitTelemetryOnErrorOutsideHandler(error, handlerEnv, Date.now());
  throw error;
}

export const handler = wrappedHandler;
