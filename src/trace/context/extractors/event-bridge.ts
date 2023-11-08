import { EventBridgeEvent } from "aws-lambda";
import { TraceContext, exportTraceData } from "../extractor";
import { logDebug } from "../../../utils";

export function readTraceFromEventbridgeEvent(event: EventBridgeEvent<any, any>): TraceContext | undefined {
  if (event?.detail?._datadog) {
    try {
      const trace = exportTraceData(event.detail._datadog);
      logDebug(`extracted trace context from Eventbridge event`, { trace, event });
      return trace;
    } catch (err) {
      if (err instanceof Error) {
        logDebug("Error parsing Eventbridge trace data", err as Error);
      }
      return;
    }
  }
}
