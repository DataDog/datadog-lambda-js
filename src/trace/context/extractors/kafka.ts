import { MSKEvent, MSKRecord, SelfManagedKafkaEvent, SelfManagedKafkaRecord } from "aws-lambda";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";
import { TraceConfig } from "../../listener";

/**
 * Extracts trace context and sets DSM consume checkpoints for Kafka events
 * delivered by a Lambda event source mapping (Amazon MSK, MSK Serverless, and
 * self-managed Kafka).
 *
 * Kafka differs from the SQS/SNS/Kinesis extractors in three ways:
 *
 * 1. Records arrive in `event.records`, an object keyed by "<topic>-<partition>"
 *    whose values are arrays of records -- not a flat `event.Records` array.
 * 2. Context lives in real Kafka message headers (`record.headers`), which are
 *    an array of single-key objects whose values are byte arrays. They must be
 *    decoded to UTF-8 to form a carrier. There is no `_datadog` payload
 *    envelope, so the payload is never parsed.
 * 3. The DSM target must be the **topic name**, not the cluster ARN.
 *    `dd-trace`'s kafkajs producer plugin tags produce edges with
 *    `topic:<topic>`; `setConsumeCheckpoint` turns its `source` argument into
 *    `topic:<source>`. Passing the ARN (as the Kinesis/SQS extractors do) would
 *    tag the consume edge with the ARN and the pathway would not connect to the
 *    producer's edge in the DSM graph.
 */
type KafkaEvent = MSKEvent | SelfManagedKafkaEvent;
type KafkaRecord = MSKRecord | SelfManagedKafkaRecord;

export class KafkaEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {}

  extract(event: KafkaEvent): SpanContextWrapper | null {
    // Set DSM consume checkpoints if enabled, and capture the first record's
    // headers for trace context extraction.
    let firstRecordHeaders: Record<string, string> | null = null;
    const topicPartitions = Object.keys(event?.records ?? {});

    if (this.config.dataStreamsEnabled) {
      let isFirstRecord = true;

      for (const topicPartition of topicPartitions) {
        for (const record of event.records[topicPartition] ?? []) {
          try {
            const headers = this.getParsedRecordHeaders(record);

            if (isFirstRecord) {
              firstRecordHeaders = headers;
              isFirstRecord = false;
            }

            // A batch can span topics, so the target is resolved per record
            // rather than once for the whole event.
            const topic = this.getTopicName(record, topicPartition);
            if (topic) {
              this.tracerWrapper.setConsumeCheckpoint(headers, "kafka", topic);
            } else {
              logDebug("Skipping DSM checkpoint for Kafka record: unable to resolve topic name", {
                topicPartition,
              });
            }
          } catch (error) {
            if (error instanceof Error) {
              logDebug("Unable to set DSM checkpoint for Kafka event", error);
            }
          }
        }
      }
    }

    const firstRecord = this.getFirstRecord(event);
    if (firstRecord === undefined) return null;

    try {
      // Reuse the headers already decoded for DSM when available.
      if (!firstRecordHeaders) {
        firstRecordHeaders = this.getParsedRecordHeaders(firstRecord);
      }

      if (firstRecordHeaders) {
        const traceContext = this.tracerWrapper.extract(firstRecordHeaders);
        if (traceContext === null) return null;

        logDebug(`Extracted trace context from Kafka event`, {
          traceContext,
          headers: firstRecordHeaders,
        });
        return traceContext;
      }
    } catch (error) {
      if (error instanceof Error) {
        logDebug("Unable to extract trace context from Kafka event", error);
      }
    }

    return null;
  }

  private getFirstRecord(event: KafkaEvent): KafkaRecord | undefined {
    for (const topicPartition of Object.keys(event?.records ?? {})) {
      const records = event.records[topicPartition];
      if (Array.isArray(records) && records.length > 0) {
        return records[0];
      }
    }
    return undefined;
  }

  /**
   * Prefers the record's own `topic` field. Falls back to parsing the
   * "<topic>-<partition>" map key, trimming only the trailing partition number
   * so topics containing hyphens survive.
   */
  private getTopicName(record: KafkaRecord | undefined, topicPartition: string): string | undefined {
    if (record?.topic) return record.topic;
    const match = /^(.*)-\d+$/.exec(topicPartition);
    return match?.[1] ?? undefined;
  }

  /**
   * Kafka headers arrive as an array of single-key objects whose values are
   * byte arrays, e.g. `[{ "dd-pathway-ctx-base64": [52, 101, ...] }]`.
   * Flattened to a `Record<string, string>` carrier that both
   * `tracerWrapper.extract` and the DSM codec can read. Header names are left
   * as-is: dd-trace reads the lowercase keys Kafka producers already emit.
   */
  private getParsedRecordHeaders(record: KafkaRecord | undefined): Record<string, string> | null {
    if (!record?.headers) {
      return null;
    }

    try {
      const headers: Record<string, string> = {};

      for (const header of record.headers) {
        if (header === null || typeof header !== "object") continue;

        for (const [name, value] of Object.entries(header)) {
          if (value === null || value === undefined) continue;

          // Byte arrays may arrive as numbers or numeric strings depending on
          // how the event was serialized in transit.
          const bytes = Array.isArray(value) ? value.map((byte) => Number(byte)) : value;
          headers[name] = Buffer.from(bytes as any).toString("utf8");
        }
      }

      return Object.keys(headers).length > 0 ? headers : null;
    } catch (error) {
      return null;
    }
  }
}
