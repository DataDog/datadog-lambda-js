import Tracer from "dd-trace";

export function isTracerInitialized() {
  // TODO, waiting for a better way from APM to tell whether tracer has been initialised.
  const tracer = Tracer as any;
  return tracer !== undefined && tracer._tracer !== undefined && "_service" in tracer._tracer;
}
