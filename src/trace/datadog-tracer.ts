import Tracer from "dd-trace";
import { LOG_EXPORTER } from "dd-trace";

export function initDatadogTracer() {
  Tracer.init({
    experimental: {
      exporter: LOG_EXPORTER,
    },
  });
}
