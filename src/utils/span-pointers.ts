import { eventTypes } from "../trace/trigger";
import { logDebug } from "./log";

export interface SpanPointerAttributes {
  kind: string;
  direction: string;
  hash: string;
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
    case eventTypes.dynamoDB:
      return processDynamoDbEvent(event);
  }
}

function processS3Event(event: any): SpanPointerAttributes[] {
  const records = event.Records || [];
  const spanPointerAttributesList: SpanPointerAttributes[] = [];

  // Get dependencies from tracer only when needed
  let S3_PTR_KIND;
  let SPAN_POINTER_DIRECTION;
  let generatePointerHash;
  try {
    const constants = require("dd-trace/packages/dd-trace/src/constants");
    const util = require("dd-trace/packages/datadog-plugin-aws-sdk/src/util");

    ({ S3_PTR_KIND, SPAN_POINTER_DIRECTION } = constants);
    ({ generatePointerHash } = util);
  } catch (err) {
    if (err instanceof Error) {
      logDebug("Failed to load dd-trace span pointer dependencies", err);
    }
    return spanPointerAttributesList;
  }

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
      kind: S3_PTR_KIND,
      direction: SPAN_POINTER_DIRECTION.UPSTREAM,
      hash: pointerHash,
    };
    spanPointerAttributesList.push(spanPointerAttributes);
  }

  return spanPointerAttributesList;
}

function processDynamoDbEvent(event: any): SpanPointerAttributes[] {
  const records = event.Records || [];
  const spanPointerAttributesList: SpanPointerAttributes[] = [];

  // Get dependencies from tracer only when needed
  let DYNAMODB_PTR_KIND;
  let SPAN_POINTER_DIRECTION;
  let generatePointerHash;
  let extractPrimaryKeys;
  try {
    const constants = require("dd-trace/packages/dd-trace/src/constants");
    const util = require("dd-trace/packages/datadog-plugin-aws-sdk/src/util");
    ({ DYNAMODB_PTR_KIND, SPAN_POINTER_DIRECTION } = constants);
    ({ generatePointerHash, extractPrimaryKeys } = util);
  } catch (err) {
    if (err instanceof Error) {
      logDebug("Failed to load dd-trace span pointer dependencies", err);
    }
    return spanPointerAttributesList;
  }

  for (const record of records) {
    const eventName = record.eventName;
    // Process INSERT, MODIFY, REMOVE events
    if (!["INSERT", "MODIFY", "REMOVE"].includes(eventName)) {
      continue;
    }

    const keys = record.dynamodb?.Keys;
    const eventSourceARN = record.eventSourceARN;
    const tableName = eventSourceARN ? getTableNameFromARN(eventSourceARN) : undefined;

    if (!tableName || !keys) {
      logDebug("Unable to calculate hash because of missing parameters.");
      continue;
    }

    const keyNamesSet = new Set(Object.keys(keys));
    const primaryKeysAndValues = extractPrimaryKeys(keyNamesSet, keys);
    if (!primaryKeysAndValues) {
      continue;
    }

    const pointerHash = generatePointerHash([tableName, ...primaryKeysAndValues]);
    const spanPointerAttributes: SpanPointerAttributes = {
      kind: DYNAMODB_PTR_KIND,
      direction: SPAN_POINTER_DIRECTION.UPSTREAM,
      hash: pointerHash,
    };
    spanPointerAttributesList.push(spanPointerAttributes);
  }

  return spanPointerAttributesList;
}

function getTableNameFromARN(arn: string): string | undefined {
  // ARN format: arn:aws:dynamodb:<region>:<account-id>:table/<table-name>/stream/<YYYY-MM-DDThh:mm:ss.ms>
  const match = arn.match(/table\/([^\/]*)/);
  return match ? match[1] : undefined;
}
