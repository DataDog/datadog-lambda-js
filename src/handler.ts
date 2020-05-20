import { datadog } from "./index";
import { env } from "process";

let userHandler: any = undefined;

function loadHandlerDynamic() {
  if (userHandler !== undefined) {
    return userHandler;
  }
  const handler = env["DATADOG_USER_HANDLER"];
  const appRoot = env["LAMBDA_TASK_ROOT"];

  // We reuse the function loading logic already inside the lambda runtime.
  const { load } = require("/var/runtime/UserFunction") as any;
  userHandler = datadog(load(appRoot, handler) as any);
  return userHandler;
}

export const handler = loadHandlerDynamic();
