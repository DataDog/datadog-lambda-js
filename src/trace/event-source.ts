/**
 * Determines whether the object matches a known lambda event type.
 * @param event
 */
export function getEventSource(event: any) {
  if (!isRecord(event)) {
    return "custom";
  }

  const firstRecord = Array.isArray(event.Records) && event.Records.length > 0 ? event.Records[0] : undefined;
  const requestContext = isRecord(event.requestContext) ? event.requestContext : undefined;

  if (requestContext && isRecord(requestContext.elb)) {
    return "application-load-balancer";
  }
  if (requestContext && typeof requestContext.stage === "string") {
    return "api-gateway";
  }

  if (firstRecord) {
    if (isRecord(firstRecord.cf)) {
      return "cloudfront";
    }
    const recordType = readEventSource(firstRecord);
    if (recordType !== undefined) {
      return recordType;
    }
  }

  if (event.source === "aws.events") {
    return "cloudwatch-event";
  }
  if (event.awslogs !== undefined) {
    return "cloudwatch-log";
  }
  if (event.eventType === "SyncTrigger") {
    return "cognito-sync-trigger";
  }

  return "custom";
}

function isRecord(event: any): event is Record<string, unknown> {
  return typeof event === "object";
}

const eventSources = {
  "aws:codecommit": "codecommit",
  "aws:dynamodb": "dynamodb",
  "aws:kinesis": "kinesis",
  "aws:s3": "s3",
  "aws:sns": "sns",
  "aws:sqs": "sqs",
} as const;

function readEventSource(record: any) {
  const eventSource = (record.eventSource ? record.eventSource : record.EventSource) as string | undefined;
  if (eventSource !== undefined) {
    return (eventSources as Record<string, string>)[eventSource] as keyof typeof eventSources;
  }
  return undefined;
}
