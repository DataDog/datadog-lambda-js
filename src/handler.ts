import { datadog, datadogHandlerEnvVar, lambdaTaskRootEnvVar, traceExtractorEnvVar, getEnvValue } from "./index";
import { TraceExtractor } from "./trace";
import { logError } from "./utils";
// We reuse the function loading logic already inside the lambda runtime.
// tslint:disable-next-line:no-var-requires
const { load } = require("/var/runtime/UserFunction") as any;

if (process.env.DD_TRACE_DISABLED_PLUGINS === undefined) {
  process.env.DD_TRACE_DISABLED_PLUGINS = "fs";
}

if (getEnvValue("DD_TRACE_ENABLED", "true").toLowerCase() === "true") {
  // tslint:disable-next-line:no-var-requires
  require("dd-trace").init({
    tags: {
      "_dd.origin": "lambda",
    },
  });
}

const taskRootEnv = getEnvValue(lambdaTaskRootEnvVar, "");
const handlerEnv = getEnvValue(datadogHandlerEnvVar, "");
const extractorEnv = getEnvValue(traceExtractorEnvVar, "");
let traceExtractor;

if (extractorEnv) {
  try {
    traceExtractor = load(taskRootEnv, extractorEnv) as TraceExtractor;
  } catch (error) {
    logError("an error occured while loading the extractor", error);
  }
}

export const handler = datadog(load(taskRootEnv, handlerEnv) as any, { traceExtractor });
