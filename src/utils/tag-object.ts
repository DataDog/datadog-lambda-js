const redactableKeys = ["authorization", "x-authorization", "password", "token"];

export function tagObject(currentSpan: any, key: string, obj: any, depth = 0, maxDepth = 10): any {
  if (depth >= maxDepth) {
    return currentSpan.setTag(key, redactVal(key, JSON.stringify(obj).substring(0, 5000)));
  }
  if (obj === null) {
    return currentSpan.setTag(key, obj);
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
