const redactableKeys = ["authorization", "x-authorization", "password", "token"];
const maxDepth = 10;

export function tagObject(currentSpan: any, key: string, obj: any, depth = 0): any {
  if (depth >= maxDepth) {
    return;
  } else {
    depth += 1;
  }
  if (obj === null) {
    return currentSpan.setTag(key, obj);
  }
  if (typeof obj === "string") {
    let parsed: string;
    try {
      parsed = JSON.parse(obj);
    } catch (e) {
      const redacted = redactVal(key, obj.substring(0, 5000));
      return currentSpan.setTag(key, redacted);
    }
    return tagObject(currentSpan, key, parsed, depth);
  }
  if (typeof obj === "number") {
    return currentSpan.setTag(key, obj);
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      tagObject(currentSpan, `${key}.${k}`, v, depth);
    }
    return;
  }
}

function redactVal(k: string, v: string): string {
  const splitKey = k.split(".").pop() || k;
  if (redactableKeys.includes(splitKey)) {
    return "redacted";
  }
  return v;
}
