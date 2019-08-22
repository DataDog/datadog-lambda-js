import Tracer from "dd-trace";

export function initDatadogTracer() {
  const functionName = process.env["AWS_LAMBDA_FUNCTION_NAME"];
  const service = functionName ? `${functionName}` : "lambda";
  Tracer.init({
    service,
    experimental: {
      exporter: "log-exporter",
    },
  });
}
