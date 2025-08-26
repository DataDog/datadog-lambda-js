import { KinesisStreamEvent, KinesisStreamRecord } from "aws-lambda";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { TraceConfig } from "../../listener";

export class KinesisEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: KinesisStreamEvent): SpanContextWrapper | null {
    // Set DSM consume checkpoints if enabled and capture first record's headers
    let firstRecordHeaders: Record<string, string> | null = null;
    if (this.config.dataStreamsEnabled) {
      for (let i = 0; i < (event?.Records || []).length; i++) {
        const record = event.Records[i];
        try {
          const headers = this.getParsedRecordHeaders(record);

          // Store first record's headers for trace context extraction
          if (i === 0) {
            firstRecordHeaders = headers;
          }

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
      // Use already parsed headers from DSM if available, otherwise parse now
      if (!firstRecordHeaders) {
        firstRecordHeaders = this.getParsedRecordHeaders(event?.Records?.[0]);
      }

      if (firstRecordHeaders) {
        const traceContext = this.tracerWrapper.extract(firstRecordHeaders);
        if (traceContext === null) return null;

        logDebug(`Extracted trace context from Kinesis event`, { traceContext, headers: firstRecordHeaders });
        return traceContext;
      }
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from Kinesis event", error);
      }
    }

    return null;
  }

  private getParsedRecordHeaders(record: KinesisStreamRecord | undefined): Record<string, string> | null {
    if (!record) {
      return null;
    }

    try {
      const kinesisDataForRecord = record?.kinesis?.data;
      if (!kinesisDataForRecord) {
        return null;
      }

      const decodedData = Buffer.from(kinesisDataForRecord, "base64").toString("ascii");
      const parsedBody = JSON.parse(decodedData);
      return parsedBody?._datadog ?? null;
    } catch (error) {
      return null;
    }
  }
}
