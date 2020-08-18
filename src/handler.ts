import { datadog, datadogHandlerEnvVar, lambdaTaskRootEnvVar, getEnvValue } from "./index";
// We reuse the function loading logic already inside the lambda runtime.
// tslint:disable-next-line:no-var-requires
const { load } = require("/var/runtime/UserFunction") as any;

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
