import { datadog, datadogHandlerEnvVar, lambdaTaskRootEnvVar, traceExtractorEnvVar, getEnvValue } from "./index";
import { TraceExtractor } from "./trace";
import { logDebug, logError } from "./utils";
// We reuse the function loading logic already inside the lambda runtime.
// tslint:disable-next-line:no-var-requires
const { load } = require("/var/runtime/UserFunction") as any;

if (process.env.DD_TRACE_DISABLED_PLUGINS === undefined) {
  process.env.DD_TRACE_DISABLED_PLUGINS = "fs";
  logDebug("disabled the dd-trace plugin 'fs'");
}

if (getEnvValue("DD_TRACE_ENABLED", "true").toLowerCase() === "true") {
  // Looks for the function local version of dd-trace first, before using
  // the version provided by the layer
  const path = require.resolve("dd-trace", { paths: ["/var/task/node_modules", ...module.paths] });
  // tslint:disable-next-line:no-var-requires
  require(path).init({
    tags: {
      "_dd.origin": "lambda",
    },
  });
  logDebug("automatically initialized dd-trace");
}

const taskRootEnv = getEnvValue(lambdaTaskRootEnvVar, "");
const handlerEnv = getEnvValue(datadogHandlerEnvVar, "");
const extractorEnv = getEnvValue(traceExtractorEnvVar, "");
let traceExtractor;

if (extractorEnv) {
  try {
    traceExtractor = load(taskRootEnv, extractorEnv) as TraceExtractor;
    logDebug("loaded custom trace context extractor", { extractorEnv });
  } catch (error) {
    logError("an error occurred while loading the custom trace context extractor", { error, extractorEnv });
  }
}

export const handler = datadog(load(taskRootEnv, handlerEnv) as any, { traceExtractor });
