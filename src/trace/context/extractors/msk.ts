import { MSKEvent, MSKRecord } from "aws-lambda";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { handleExtractionError } from "../extractor-utils";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";

export class MSKEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper) {}

  extract(event: MSKEvent): SpanContextWrapper | null {
    if (!event?.records) {
      logDebug("Failed to extract trace context from MSK event");
      return null;
    }

    try {
      // A Lambda span can have only one parent. Use the first record with valid
      // trace context, without combining headers from different records.
      for (const records of Object.values(event.records)) {
        if (!Array.isArray(records)) continue;
        for (const record of records) {
          const headers = this.getParsedRecordHeaders(record);
          if (!headers) continue;
          const traceContext = this.tracerWrapper.extract(headers);
          if (traceContext) {
            logDebug("Extracted trace context from MSK event");
            return traceContext;
          }
        }
      }
    } catch (error) {
      handleExtractionError(error, "MSK");
    }

    logDebug("Failed to extract trace context from MSK event");
    return null;
  }

  private getParsedRecordHeaders(record: MSKRecord): Record<string, string> | null {
    if (!Array.isArray(record?.headers)) return null;

    let headers: Record<string, string> | null = null;
    for (const entry of record.headers) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      for (const [name, value] of Object.entries(entry)) {
        // MSK serializes Kafka header bytes as integer arrays, not base64.
        if (Array.isArray(value)) {
          headers ??= {};
          headers[name.toLowerCase()] = Buffer.from(value).toString("utf8");
        }
      }
    }
    return headers;
  }
}
