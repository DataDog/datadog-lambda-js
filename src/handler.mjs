import { datadog, datadogHandlerEnvVar, lambdaTaskRootEnvVar, traceExtractorEnvVar, getEnvValue } from "./index.js";
import { logDebug, logError } from "./utils/index.js";
import { load } from "./runtime/index.js";
import { loadTracer } from "./runtime/module_importer.js";
import { initTracer } from "./trace/index.js";

if (process.env.DD_TRACE_DISABLED_PLUGINS === undefined) {
  process.env.DD_TRACE_DISABLED_PLUGINS = "fs";
  logDebug("disabled the dd-trace plugin 'fs'");
}

const tracer = loadTracer();
if (getEnvValue("DD_TRACE_ENABLED", "true").toLowerCase() === "true") {
  initTracer(tracer);
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

export const handler = datadog(await load(taskRootEnv, handlerEnv), tracer, { traceExtractor });
