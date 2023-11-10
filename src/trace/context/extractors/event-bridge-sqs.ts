import { EventBridgeEvent, SQSEvent } from "aws-lambda";
import { TraceContext, exportTraceData } from "../extractor";
import { logDebug } from "../../../utils";

export function readTraceFromEBSQSEvent(event: SQSEvent): TraceContext | undefined {
  if (event?.Records?.[0]?.body) {
    try {
      const parsedBody = JSON.parse(event.Records[0].body) as EventBridgeEvent<any, any>;
      if (parsedBody?.detail?._datadog) {
        const trace = exportTraceData(parsedBody.detail._datadog);

        logDebug(`extracted trace context from EventBridge SQS event`, { trace, event });
        return trace;
      }
    } catch (err) {
      if (err instanceof Error) {
        logDebug("Error parsing EventBridge SQS message trace data", err as Error);
      }
      return;
    }
  }
}
