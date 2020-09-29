import { datadog, datadogHandlerEnvVar, lambdaTaskRootEnvVar, getEnvValue } from "./index";
// We reuse the function loading logic already inside the lambda runtime.
// tslint:disable-next-line:no-var-requires
const { load } = require("/var/runtime/UserFunction") as any;

if (getEnvValue("DD_FS_INTEGRATION_ENABLED", "false").toLowerCase() === "false") {
  if (process.env.DD_TRACE_DISABLED_PLUGINS) {
    process.env.DD_TRACE_DISABLED_PLUGINS = `${process.env.DD_TRACE_DISABLED_PLUGINS},fs`;
  } else {
    process.env.DD_TRACE_DISABLED_PLUGINS = 'fs';
  }
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
export const handler = datadog(load(taskRootEnv, handlerEnv) as any);
