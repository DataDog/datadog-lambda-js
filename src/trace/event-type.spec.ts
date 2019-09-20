import { getEventType, findEventMatch } from "./event-type";
import { readFileSync } from "fs";

describe("matchEvent", () => {
  const events = [
    { result: "application-load-balancer", file: "application-load-balancer.json" },
    { result: "api-gateway", file: "apigateway-proxy.json" },
    { result: "cloudwatch-event", file: "cloudwatch-event.json" },
    { result: "cloudwatch-log", file: "cloudwatch-log.json" },
    { result: "cognito-sync-trigger", file: "cognito-sync-trigger.json" },
    { result: "code-commit", file: "code-commit.json" },
    { result: "dynamo-db", file: "dynamodb-update.json" },
    { result: "kinesis", file: "kinesis-data-stream.json" },
    { result: "s3", file: "s3-put.json" },
    { result: "sns", file: "sns-topic-notification.json" },
    { result: "cloudfront", file: "cloudfront-http-redirect.json" },
    { result: "sqs", file: "sqs.json" },
  ];
  it("matches expected outputs for sample events", () => {
    for (let event of events) {
      const eventData = JSON.parse(readFileSync(`./event-samples/${event.file}`, "utf8"));
      const result = getEventType(eventData);
      expect(result).toEqual(event.result);
    }
  });
  it("returns custom when no event matches", () => {
    const eventData = { a: "Some random event" };
    const result = getEventType(eventData);
    expect(result).toEqual("custom");
  });
});

describe("findEventMatch", () => {
  it("matches for string types", () => {
    const map = {
      "first-type": { a: "string" },
    } as const;
    const type = findEventMatch(map, { a: "hello" });
    expect(type).toEqual("first-type");
  });
  it("matches for number types", () => {
    const map = {
      "first-type": { b: "number" },
    } as const;
    const type = findEventMatch(map, { b: 100 });
    expect(type).toEqual("first-type");
  });
  it("matches for object types", () => {
    const map = {
      "first-type": { b: "number" },
      "second-type": { c: "object" },
    } as const;
    const type = findEventMatch(map, { c: {} });
    expect(type).toEqual("second-type");
  });
  it("matches for array types", () => {
    const map = {
      "first-type": { b: "number" },
      "second-type": { c: "array" },
    } as const;
    const type = findEventMatch(map, { c: [] });
    expect(type).toEqual("second-type");
  });
  it("matches for regex strings", () => {
    const map = {
      "first-type": { b: "number" },
      "second-type": { b: /abc/ },
    } as const;
    const type = findEventMatch(map, { b: "abc" });
    expect(type).toEqual("second-type");
  });
  it("matches for properties of first array child", () => {
    const map = {
      "first-type": { b: "number" },
      "second-type": { "b[].a": "string" },
    } as const;
    const type = findEventMatch(map, { b: [{ a: "abc" }] });
    expect(type).toEqual("second-type");
  });
  it("doesn't match for incorrect types", () => {
    const map = {
      "first-type": { a: "string", b: "number" },
    } as const;
    const type = findEventMatch(map, { a: 100, b: "hello" });
    expect(type).toBeUndefined;
  });
});
