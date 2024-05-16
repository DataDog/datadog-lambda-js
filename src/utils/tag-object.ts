import { logDebug } from "./log";

const redactableKeys = ["authorization", "x-authorization", "password", "token"];

export function tagObject(currentSpan: any, key: string, obj: any, depth = 0, maxDepth = 10): any {
  if (obj === null) {
    // when val is null, unlike undefined, it will be stringified into '{"key":null}'
    return currentSpan.setTag(key, obj);
  }
  if (depth >= maxDepth) {
    let strOrUndefined;
    try {
      strOrUndefined = JSON.stringify(obj);
    } catch (e) {
      logDebug(`Unable to stringify object for tagging: ${e}`);
      return;
    }
    if (typeof strOrUndefined === "undefined") return;
    return currentSpan.setTag(key, redactVal(key, strOrUndefined.substring(0, 5000)));
  }
  depth += 1;
  if (typeof obj === "string") {
    let parsed: string;
    try {
      parsed = JSON.parse(obj);
    } catch (e) {
      const redacted = redactVal(key, obj.substring(0, 5000));
      return currentSpan.setTag(key, redacted);
    }
    return tagObject(currentSpan, key, parsed, depth, maxDepth);
  }
  if (typeof obj === "number" || typeof obj === "boolean") {
    return currentSpan.setTag(key, obj.toString());
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      tagObject(currentSpan, `${key}.${k}`, v, depth, maxDepth);
    }
  }
}

function redactVal(k: string, v: string): string {
  const splitKey = k.split(".").pop() || k;
  if (redactableKeys.includes(splitKey)) {
    return "redacted";
  }
  return v;
}
