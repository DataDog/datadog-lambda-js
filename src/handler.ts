import { datadog, datadogHandlerEnvVar, lambdaTaskRootEnvVar, getEnvValue } from "./index";
// We reuse the function loading logic already inside the lambda runtime.
const { load } = require("/var/runtime/UserFunction") as any;

const taskRootEnv = getEnvValue(lambdaTaskRootEnvVar, "");
const handlerEnv = getEnvValue(datadogHandlerEnvVar, "");
export const handler = datadog(load(taskRootEnv, handlerEnv) as any);
