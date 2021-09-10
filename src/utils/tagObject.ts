const redactableKeys = ["authorization", "x-authorization", "password", "token"];

export function tagObject(currentSpan: any, key: string, obj: any): any {
  if (obj === null) {
    // console.log("setting null", key, "to value: ", obj);
    return currentSpan.setTag(key, obj);
  }
  if (typeof obj === "string") {
    let parsed: string;
    try {
      parsed = JSON.parse(obj);
    } catch (e) {
      const redacted = redactVal(key, obj.substring(0, 5000));
      // console.log("setting ", key, "to value: ", redacted);
      return currentSpan.setTag(key, redacted);
    }
    return tagObject(currentSpan, key, parsed);
  }
  if (typeof obj === "number") {
    // console.log("setting number", key, "to value: ", obj);
    return currentSpan.setTag(key, obj);
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      tagObject(currentSpan, `${key}.${k}`, v);
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
