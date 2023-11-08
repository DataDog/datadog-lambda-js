import { SNSMessage, SQSEvent } from "aws-lambda";
import { TraceContext, exportTraceData } from "../extractor";
import { logDebug } from "../../../utils";

export function readTraceFromSNSSQSEvent(event: SQSEvent): TraceContext | undefined {
  if (event?.Records?.[0]?.body) {
    try {
      const parsedBody = JSON.parse(event.Records[0].body) as SNSMessage;
      if (
        parsedBody.MessageAttributes &&
        parsedBody.MessageAttributes._datadog &&
        parsedBody.MessageAttributes._datadog.Value
      ) {
        let traceData;
        if (parsedBody.MessageAttributes._datadog.Type === "String") {
          traceData = JSON.parse(parsedBody.MessageAttributes._datadog.Value);
        } else {
          const b64Decoded = Buffer.from(parsedBody.MessageAttributes._datadog.Value, "base64").toString("ascii");
          traceData = JSON.parse(b64Decoded);
        }
        const trace = exportTraceData(traceData);

        logDebug(`extracted trace context from SNS SQS event`, { trace, event });
        return trace;
      }
    } catch (err) {
      if (err instanceof Error) {
        logDebug("Error parsing SNS SQS message trace data", err as Error);
      }
      return;
    }
  }
}
