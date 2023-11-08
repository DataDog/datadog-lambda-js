import { SNSEvent } from "aws-lambda";
import { TraceContext, exportTraceData } from "../extractor";
import { logDebug } from "../../../utils";

export function readTraceFromSNSEvent(event: SNSEvent): TraceContext | undefined {
  if (event?.Records?.[0]?.Sns?.MessageAttributes?._datadog?.Value) {
    try {
      let traceData;
      if (event.Records[0].Sns.MessageAttributes._datadog.Type === "String") {
        traceData = JSON.parse(event.Records[0].Sns.MessageAttributes._datadog.Value);
      } else {
        const b64Decoded = Buffer.from(event.Records[0].Sns.MessageAttributes._datadog.Value, "base64").toString(
          "ascii",
        );
        traceData = JSON.parse(b64Decoded);
      }
      const trace = exportTraceData(traceData);
      logDebug(`extracted trace context from SNS event`, { trace, event });
      return trace;
    } catch (err) {
      if (err instanceof Error) {
        logDebug("Error parsing SNS SQS message trace data", err as Error);
      }
      return;
    }
  }
}
