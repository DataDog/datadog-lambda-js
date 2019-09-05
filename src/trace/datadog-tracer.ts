import Tracer from "dd-trace";

const AWS_LAMBDA_FUNCTION_NAME = "AWS_LAMBDA_FUNCTION_NAME";

export function initDatadogTracer() {
  const functionName = process.env[AWS_LAMBDA_FUNCTION_NAME];
  const service = functionName ? `${functionName}` : "lambda";
  Tracer.init({
    experimental: {
      exporter: "log",
    },
    service,
  });
}
