import Tracer from "dd-trace";

export function isTracerInitialized() {
  // TODO, waiting for a better way from APM to tell whether tracer has been initialised.
  return "_service" in (Tracer as any)._tracer;
}
