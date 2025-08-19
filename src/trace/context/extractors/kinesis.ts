import { KinesisStreamEvent } from "aws-lambda";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";

export class KinesisEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: KinesisStreamEvent): SpanContextWrapper | null {
    let context: SpanContextWrapper | null = null;

    for (const record of event?.Records || []) {
      try {
        const kinesisData = record?.kinesis?.data;
        const decodedData = Buffer.from(kinesisData, "base64").toString("ascii");
        const parsedBody = JSON.parse(decodedData);
        const headers = parsedBody?._datadog ?? null;
        this.tracerWrapper.setConsumeCheckpoint(headers, "kinesis", record.eventSourceARN);

        // If we already have a context, we can skip the rest of the records
        // also, if DSM is disabled, we can stop extracting context after the first record
        if (!this.tracerWrapper.isDataStreamsEnabled && context) {
          break;
        }
        if (context) continue;

        if (headers) {
          context = this.tracerWrapper.extract(headers);
          if (context !== null) {
            logDebug(`Extracted trace context from Kinesis event`, { traceContext: context, headers });
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          logDebug("Unable to extract trace context from Kinesis event", error);
        }
      }
    }
    return context;
  }
}
