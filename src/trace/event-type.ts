export type EventProp = "string" | "number" | "boolean" | RegExp | "object" | "array";
export type EventMapItem = {
  [key: string]: EventProp;
};
export interface EventMapType {
  [key: string]: EventMapItem;
}

const eventMap = {
  "application-load-balancer": { "requestContext.elb.targetGroupArn": "string" },
  "api-gateway": { "requestContext.stage": "string" },
  "cloudwatch-event": { source: /(aws\.events)/ },
  "cloudwatch-log": { "awslogs.data": "string" },
  "cognito-sync-trigger": { eventType: /(SyncTrigger)/ },
  "code-commit": { "Records[].codecommit": "object" },
  "dynamo-db": { "Records[].dynamodb": "object" },
  kinesis: { "Records[].kinesis": "object" },
  s3: { "Records[].s3": "object" },
  sns: { "Records[].Sns": "object" },
  cloudfront: { "Records[].cf": "object" },
  sqs: { "Records[].eventSource": /(aws\:sqs)/ },
} as const;

/**
 * Determines whether the object matches a known lambda event type.
 * @param event
 */
export function getEventType(event: any): string {
  const result = findEventMatch(eventMap, event);
  return result !== undefined ? result : "custom";
}

export function findEventMatch(eventMap: EventMapType, event: any): string | undefined {
  if (!isRecord(event)) {
    return undefined;
  }

  for (const eventType of Object.keys(eventMap)) {
    const item = eventMap[eventType];
    if (eventMatches(event, item)) {
      return eventType;
    }
  }
}

function isRecord(event: any): event is Record<string, unknown> {
  if (typeof event !== "object") {
    return false;
  }
  return true;
}

function eventMatches(event: Record<string, unknown>, item: EventMapItem): boolean {
  for (const propertyPath of Object.keys(item)) {
    const type = item[propertyPath];
    if (!propertyMatches(event, propertyPath, type)) {
      return false;
    }
  }
  return true;
}

function propertyMatches(event: Record<string, unknown>, propertyPath: string, type: EventProp): boolean {
  let obj: any = getObjectForPath(event, propertyPath);

  if (type instanceof RegExp) {
    return typeof obj === "string" && obj.match(type) !== null;
  }

  switch (type) {
    case "array":
      return Array.isArray(obj);
    case "object":
      return !Array.isArray(obj) && typeof obj === "object";
    default:
      return typeof obj === type;
  }
}

function getObjectForPath(event: Record<string, unknown>, propertyPath: string): any {
  let obj: any = event;
  const parts = propertyPath.split(".");

  for (let i = 0; i < parts.length; ++i) {
    let part = parts[i];
    const shouldBeArray = part.endsWith("[]");
    const shouldBeObject = i !== parts.length - 1;
    if (shouldBeArray) {
      part = part.substr(0, part.length - 2);
    }
    obj = obj[part];

    if (shouldBeArray) {
      if (!Array.isArray(obj) || obj.length === 0) {
        return undefined;
      }
      obj = obj[0];
    }

    if (shouldBeObject && (typeof obj !== "object" || Array.isArray(obj))) {
      return undefined;
    }
  }
  return obj;
}
