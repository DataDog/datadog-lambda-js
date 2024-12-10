import { eventTypes } from "../trace/trigger";
import { logDebug } from "./log";
import { S3_PTR_KIND, DYNAMODB_PTR_KIND, SPAN_POINTER_DIRECTION } from "dd-trace/packages/dd-trace/src/constants";
// import { generatePointerHash, extractPrimaryKeys } from "dd-trace/packages/dd-trace/src/util";
import { generatePointerHash, extractPrimaryKeys } from "dd-trace/packages/datadog-plugin-aws-sdk/src/util";

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
  console.log('[LIBRARY] getSpanPointerAttributes');
  if (!eventSource) {
    return;
  }

  switch (eventSource) {
    case eventTypes.s3:
      return processS3Event(event);
    case eventTypes.dynamoDB:
      return processDynamoDbEvent(event);
    default:
      logDebug(`Event type ${eventSource} not supported by span pointers.`);
      return;
  }
}

function processS3Event(event: any): SpanPointerAttributes[] {
  const records = event.Records || [];
  const spanPointerAttributesList: SpanPointerAttributes[] = [];

  for (const record of records) {
    const eventName = record.eventName;
    if (!eventName.startsWith("ObjectCreated")) {
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

function processDynamoDbEvent(event: any): SpanPointerAttributes[] {
  console.log('[LIBRARY] processDynamoDbEvent');
  const records = event.Records || [];
  const spanPointerAttributesList: SpanPointerAttributes[] = [];

  for (const record of records) {
    const eventName = record.eventName;
    console.log("[LIBRARY] eventName:", eventName);
    // Process INSERT, MODIFY, REMOVE events
    if (!["INSERT", "MODIFY", "REMOVE"].includes(eventName)) {
      continue;
    }

    const keys = record.dynamodb?.Keys;
    console.log("[LIBRARY] keys:", keys);
    const eventSourceARN = record.eventSourceARN;
    console.log("[LIBRARY] eventSourceARN:", eventSourceARN);
    const tableName = record.eventSourceARN ? getTableNameFromARN(eventSourceARN) : undefined;
    console.log("[LIBRARY] tableName:", tableName);

    if (!tableName || !keys) {
      logDebug("Unable to calculate hash because of missing parameters.");
      continue;
    }

    const keyValues = extractPrimaryKeys(keys, keys);
    console.log("[LIBRARY] keyValues:", keyValues);
    if (!keyValues) {
      continue;
    }

    const pointerHash = generatePointerHash([tableName, ...keyValues]);
    console.log("[LIBRARY] hash:", pointerHash);
    const spanPointerAttributes: SpanPointerAttributes = {
      pointerKind: DYNAMODB_PTR_KIND,
      pointerDirection: SPAN_POINTER_DIRECTION.UPSTREAM,
      pointerHash,
    };
    spanPointerAttributesList.push(spanPointerAttributes);
  }

  return spanPointerAttributesList;
}

function getTableNameFromARN(arn: string): string | undefined {
  // ARN format: arn:aws:dynamodb:region:account-id:table/table-name/stream/stream-label
  const match = arn.match(/table\/([^\/]*)/);
  return match ? match[1] : undefined;
}
