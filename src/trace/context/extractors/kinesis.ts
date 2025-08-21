import { KinesisStreamEvent } from "aws-lambda";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { getDataStreamsEnabled } from "../../../index";

export class KinesisEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: KinesisStreamEvent): SpanContextWrapper | null {
    let context: SpanContextWrapper | null = null;

    for (const record of event?.Records || []) {
      try {
        // If we already have a context and dsm is not enabled, we can break out of the loop early
        if (!getDataStreamsEnabled() && context) {
          break;
        }

        const kinesisData = record?.kinesis?.data;
        const decodedData = Buffer.from(kinesisData, "base64").toString("ascii");
        const parsedBody = JSON.parse(decodedData);
        const headers = parsedBody?._datadog ?? null;
        this.tracerWrapper.setConsumeCheckpoint(headers, "kinesis", record.eventSourceARN);

        // if we already have a context, no need to extract again
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
