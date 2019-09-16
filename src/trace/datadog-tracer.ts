import Tracer from "dd-trace";
import { logDebug } from "../utils";

const AWS_LAMBDA_FUNCTION_NAME = "AWS_LAMBDA_FUNCTION_NAME";

export function initDatadogTracer() {
  const functionName = process.env[AWS_LAMBDA_FUNCTION_NAME];
  if (functionName === undefined) {
    logDebug(`Enviroment variable ${AWS_LAMBDA_FUNCTION_NAME} unavailable, using service name 'lambda'`);
  }
  const service = functionName ? `${functionName}` : "lambda";
  Tracer.init({
    experimental: {
      exporter: "log",
    },
    service,
  });
  logDebug(`Initialized datadog tracer for lambda`);
}
