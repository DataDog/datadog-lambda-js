import { eventTypes } from "../trace/trigger";
import { logDebug } from "./log";

interface SpanPointerAttributes {
  pointerKind: string;
  pointerDirection: string;
  pointerHash: string;
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
  }
}

function processS3Event(event: any): SpanPointerAttributes[] {
  const records = event.Records || [];
  const spanPointerAttributesList: SpanPointerAttributes[] = [];

  // Get dependencies from tracer only when needed
  let constants;
  let util;
  try {
    constants = require("dd-trace/packages/dd-trace/src/constants");
    util = require("dd-trace/packages/dd-trace/src/util");
  } catch (err) {
    if (err instanceof Error) {
      logDebug("Failed to load dd-trace span pointer dependencies", err);
    }
    return spanPointerAttributesList;
  }

  const { S3_PTR_KIND, SPAN_POINTER_DIRECTION } = constants;
  const { generatePointerHash } = util;

  for (const record of records) {
    const eventName = record.eventName;
    if (!eventName || !eventName.startsWith("ObjectCreated")) {
      continue;
    }
    // Values are stored in the same place, regardless of AWS SDK v2/v3 or the event type.
    // https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html
    const s3Event = record?.s3;
    const bucketName = s3Event?.bucket?.name;
    const objectKey = s3Event?.object?.key;
    let eTag = s3Event?.object?.eTag;

    if (!bucketName || !objectKey || !eTag) {
      logDebug("Unable to calculate span pointer hash because of missing parameters.");
      continue;
    }

    // https://github.com/DataDog/dd-span-pointer-rules/blob/main/AWS/S3/Object/README.md
    if (eTag.startsWith('"') && eTag.endsWith('"')) {
      eTag = eTag.slice(1, -1);
    }
    const pointerHash = generatePointerHash([bucketName, objectKey, eTag]);
    const spanPointerAttributes: SpanPointerAttributes = {
      pointerKind: S3_PTR_KIND,
      pointerDirection: SPAN_POINTER_DIRECTION.UPSTREAM,
      pointerHash,
    };
    spanPointerAttributesList.push(spanPointerAttributes);
  }

  return spanPointerAttributesList;
}
