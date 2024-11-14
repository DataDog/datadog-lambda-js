import { eventTypes } from "../trace/trigger";
import { logDebug } from "./log";
import {
  SPAN_LINK_KIND,
  S3_PTR_KIND,
  SPAN_POINTER_DIRECTION,
  generateS3PointerHash,
} from "dd-trace/packages/dd-trace/src/span_pointers";

interface SpanPointerAttributes {
  "ptr.kind": string;
  "ptr.dir": string;
  "ptr.hash": string;
  "link.kind": string;
}

/**
 * Computes span pointer attributes
 *
 * @param {eventTypes} eventSource - The type of event being processed (e.g., S3, DynamoDB).
 * @param {any} event - The event object containing source-specific data.
 * @returns {SpanPointerAttributes[] | undefined} An array of span pointer attribute objects, or undefined if none could be computed.
 */
export function getSpanPointerAttributes(
  eventSource: eventTypes | undefined,
  event: any,
): SpanPointerAttributes[] | undefined {
  if (!eventSource) {
    return;
  }

  switch (eventSource) {
    case eventTypes.s3:
      return processS3Event(event);
    default:
      logDebug(`Event type ${eventSource} not supported by span pointers.`);
      return;
  }
}

function processS3Event(event: any): SpanPointerAttributes[] {
  const records = event.Records || [];
  const spanPointerAttributesList = [];
  const linkKind = SPAN_LINK_KIND;

  for (const record of records) {
    const eventName = record.eventName;
    if (!["ObjectCreated:Put", "ObjectCreated:Copy", "ObjectCreated:CompleteMultipartUpload"].includes(eventName)) {
      continue;
    }
    // Values are stored in the same place, regardless of AWS SDK v2/v3 or the event type.
    // https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html
    const s3Event = record?.s3;
    const bucketName = s3Event?.bucket?.name;
    const objectKey = s3Event?.object?.key;
    const eTag = s3Event?.object?.eTag;

    if (!bucketName || !objectKey || !eTag) {
      logDebug("Unable to calculate span pointer hash because of missing parameters.");
      continue;
    }

    const pointerHash = generateS3PointerHash(bucketName, objectKey, eTag);
    const spanPointerAttributes = {
      "ptr.kind": S3_PTR_KIND,
      "ptr.dir": SPAN_POINTER_DIRECTION.UPSTREAM,
      "ptr.hash": pointerHash,
      "link.kind": linkKind,
    };
    spanPointerAttributesList.push(spanPointerAttributes);
  }

  return spanPointerAttributesList;
}
