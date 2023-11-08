import { logDebug } from "../../../utils";
import { TraceContext, exportTraceData, parentIDHeader, samplingPriorityHeader, traceIDHeader } from "../extractor";

export function readTraceFromLambdaContext(context: any): TraceContext | undefined {
  if (!context || typeof context !== "object") {
    return;
  }

  const custom = context.clientContext?.custom;

  if (!custom || typeof custom !== "object") {
    return;
  }
  let traceData = null;

  if (
    custom.hasOwnProperty("_datadog") &&
    typeof custom._datadog === "object" &&
    custom._datadog.hasOwnProperty(traceIDHeader) &&
    custom._datadog.hasOwnProperty(parentIDHeader) &&
    custom._datadog.hasOwnProperty(samplingPriorityHeader)
  ) {
    traceData = custom._datadog;
  } else if (
    custom.hasOwnProperty(traceIDHeader) &&
    custom.hasOwnProperty(parentIDHeader) &&
    custom.hasOwnProperty(samplingPriorityHeader)
  ) {
    traceData = custom;
  } else {
    return;
  }

  const trace = exportTraceData(traceData);
  logDebug(`extracted trace context from lambda context`, { trace, context });
  return trace;
}
