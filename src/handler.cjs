const {
  datadog,
  datadogHandlerEnvVar,
  lambdaTaskRootEnvVar,
  traceExtractorEnvVar,
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

exports.handler = datadog(loadSync(taskRootEnv, handlerEnv), { traceExtractor });
