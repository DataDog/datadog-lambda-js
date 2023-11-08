import { SQSEvent } from "aws-lambda";
import { TraceContext, exportTraceData } from "../extractor";
import { logDebug } from "../../../utils";

export function readTraceFromSQSEvent(event: SQSEvent): TraceContext | undefined {
  if (event?.Records?.[0]?.messageAttributes?._datadog?.stringValue) {
    const traceHeaders = event.Records[0].messageAttributes._datadog.stringValue;

    try {
      const trace = exportTraceData(JSON.parse(traceHeaders));

      logDebug(`extracted trace context from sqs event`, { trace, event });
      return trace;
    } catch (err) {
      if (err instanceof Error) {
        logDebug("Error parsing SQS message trace data", err as Error);
      }
      return;
    }
  }

  return;
}
