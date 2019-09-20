import { getEventSource } from "./event-source";
import { readFileSync } from "fs";

describe("matchEvent", () => {
  const events = [
    { result: "application-load-balancer", file: "application-load-balancer.json" },
    { result: "api-gateway", file: "apigateway-proxy.json" },
    { result: "cloudwatch-event", file: "cloudwatch-event.json" },
    { result: "cloudwatch-log", file: "cloudwatch-log.json" },
    { result: "cognito-sync-trigger", file: "cognito-sync-trigger.json" },
    { result: "codecommit", file: "code-commit.json" },
    { result: "dynamodb", file: "dynamodb-update.json" },
    { result: "kinesis", file: "kinesis-data-stream.json" },
    { result: "s3", file: "s3-put.json" },
    { result: "sns", file: "sns-topic-notification.json" },
    { result: "cloudfront", file: "cloudfront-http-redirect.json" },
    { result: "sqs", file: "sqs.json" },
  ];
  it("matches expected outputs for sample events", () => {
    for (let event of events) {
      const eventData = JSON.parse(readFileSync(`./event-samples/${event.file}`, "utf8"));
      const result = getEventSource(eventData);
      expect(result).toEqual(event.result);
    }
  });
  it("returns custom when no event matches", () => {
    const eventData = { a: "Some random event" };
    const result = getEventSource(eventData);
    expect(result).toEqual("custom");
  });
});
