import { KinesisStreamEvent } from "aws-lambda";
import { TraceContext, exportTraceData } from "../extractor";
import { logDebug } from "../../../utils";

export function readTraceFromKinesisEvent(event: KinesisStreamEvent): TraceContext | undefined {
  if (event?.Records?.[0]?.kinesis?.data) {
    try {
      const parsedBody = JSON.parse(Buffer.from(event.Records[0].kinesis.data, "base64").toString("ascii")) as any;
      if (parsedBody && parsedBody._datadog) {
        const trace = exportTraceData(parsedBody._datadog);
        logDebug(`extracted trace context from Kinesis event`, { trace });
        return trace;
      }
    } catch (err) {
      if (err instanceof Error) {
        logDebug("Error parsing Kinesis message trace data", err as Error);
      }
      return;
    }
  }
}
