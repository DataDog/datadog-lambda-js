import { KinesisStreamEvent } from "aws-lambda";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { TraceConfig } from "trace/listener";

export class KinesisEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: KinesisStreamEvent): SpanContextWrapper[] {
    const spanContexts: SpanContextWrapper[] = [];

    if (!event.Records) {
      return spanContexts;
    }

    for (const record of event.Records) {
      const kinesisData = record.kinesis.data;
      if (kinesisData === undefined) continue;

      try {
        const decodedData = Buffer.from(kinesisData, "base64").toString("ascii");
        const parsedBody = JSON.parse(decodedData);
        const headers = parsedBody?._datadog;
        if (headers) {
          const traceContext = this.tracerWrapper.extract(headers);
          if (traceContext === null) continue;

          logDebug(`Extracted trace context from Kinesis event`, { traceContext, headers });
          spanContexts.push(traceContext);
        }

        // If span links is disabled only extract from the first record.
        if (!this.config.useSpanLinks) {
          break;
        }
      } catch (error) {
        if (error instanceof Error) {
          logDebug("Unable to extract trace context from Kinesis event", error);
        }
      }
    }

    return spanContexts;
  }
}
