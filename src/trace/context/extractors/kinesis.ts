import { KinesisStreamEvent } from "aws-lambda";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { TraceConfig } from "../../listener";

export class KinesisEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: KinesisStreamEvent): SpanContextWrapper | null {
    // Set DSM consume checkpoints if enabled
    if (this.config.dataStreamsEnabled) {
      for (const record of event?.Records || []) {
        try {
          const kinesisDataForRecord = record?.kinesis?.data;
          const decodedData = Buffer.from(kinesisDataForRecord, "base64").toString("ascii");
          const parsedBody = JSON.parse(decodedData);
          const headers = parsedBody?._datadog ?? null;
          this.tracerWrapper.setConsumeCheckpoint(headers, "kinesis", record.eventSourceARN);
        } catch (error) {
          if (error instanceof Error) {
            logDebug("Unable to set DSM checkpoint for Kinesis event", error);
          }
        }
      }
    }

    const kinesisData = event?.Records?.[0]?.kinesis.data;
    if (kinesisData === undefined) return null;

    try {
      const decodedData = Buffer.from(kinesisData, "base64").toString("ascii");
      const parsedBody = JSON.parse(decodedData);
      const headers = parsedBody?._datadog;
      if (headers) {
        const traceContext = this.tracerWrapper.extract(headers);
        if (traceContext === null) return null;

        logDebug(`Extracted trace context from Kinesis event`, { traceContext, headers });
        return traceContext;
      }
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from Kinesis event", error);
      }
    }

    return null;
  }
}
