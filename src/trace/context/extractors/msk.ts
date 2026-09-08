import { MSKEvent, MSKRecord } from "aws-lambda";
import { EventTraceExtractor } from "../extractor";
import { handleExtractionError } from "../extractor-utils";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";

export class MSKEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: MSKEvent): SpanContextWrapper | null {
    // A Lambda span can have only one parent. Use the first record with valid
    // trace context, without combining headers from different records.
    for (const records of Object.values(event.records ?? {})) {
      if (!Array.isArray(records)) continue;
      for (const record of records) {
        try {
          const headers = this.getParsedRecordHeaders(record);
          if (Object.keys(headers).length === 0) continue;
          const traceContext = this.tracerWrapper.extract(headers);
          if (traceContext) return traceContext;
        } catch (error) {
          handleExtractionError(error, "MSK");
        }
      }
    }
    return null;
  }

  private getParsedRecordHeaders(record: MSKRecord): Record<string, string> {
    const headers: Record<string, string> = Object.create(null);
    if (!Array.isArray(record?.headers)) return headers;

    for (const entry of record.headers) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      for (const [name, value] of Object.entries(entry)) {
        // MSK serializes Kafka header bytes as integer arrays, not base64.
        // Validate before decoding because Buffer.from silently coerces invalid bytes.
        if (Array.isArray(value) && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
          headers[name.toLowerCase()] = Buffer.from(value).toString("utf8");
        }
      }
    }
    return headers;
  }
}
