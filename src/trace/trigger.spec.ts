import { getEventSource, getEventSourceARN, extractTriggerTags } from "./trigger";
import { readFileSync } from "fs";

import { Context } from "aws-lambda";

const mockARN = "arn:aws:lambda:us-east-1:123456789012:function:test-nodejs-lambda";
const mockContext = ({
  invokedFunctionArn: mockARN,
} as any) as Context;

describe("getEventSource", () => {
  const events = [
    {
      result: {
        "trigger.event_source": "api-gateway",
        "trigger.event_source_arn": "arn:aws:apigateway:us-east-1::/restapis/1234567890/stages/prod",
        "http.url": "70ixmpl4fl.execute-api.us-east-2.amazonaws.com",
        "http.url_details.path": "/prod/path/to/resource",
        "http.method": "POST",
      }, file: "api-gateway.json"
    },
    {
      result: {
        "trigger.event_source": "application-load-balancer",
        "trigger.event_source_arn": "arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/lambda-xyz/123abc",
        "http.url_details.path": "/lambda",
        "http.method": "GET",
      }, file: "application-load-balancer.json"
    },
    {
      result: {
        "trigger.event_source": "cloudfront",
        "trigger.event_source_arn": "arn:aws:cloudfront::123456789012:distribution/EXAMPLE",
      }, file: "cloudfront.json"
    },
    {
      result: {
        "trigger.event_source": "cloudwatch-events",
        "trigger.event_source_arn": "arn:aws:events:us-east-1:123456789012:rule/ExampleRule",
      }, file: "cloudwatch-events.json"
    },
    {
      result: {
        "trigger.event_source": "cloudwatch-logs",
        "trigger.event_source_arn": "arn:aws:logs:us-east-1:123456789012:log-group:testLogGroup",
      }, file: "cloudwatch-logs.json"
    },
    { result: {}, file: "custom.json" },
    {
      result: {
        "trigger.event_source": "dynamodb",
        "trigger.event_source_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/ExampleTableWithStream/stream/2015-06-27T00:48:05.899",
      }, file: "dynamodb.json"
    },
    {
      result: {
        "trigger.event_source": "kinesis",
        "trigger.event_source_arn": "arn:aws:kinesis:EXAMPLE",
      }, file: "kinesis.json"
    },
    {
      result: {
        "trigger.event_source": "s3",
        "trigger.event_source_arn": "arn:aws:s3:::example-bucket",
      }, file: "s3.json"
    },
    {
      result: {
        "trigger.event_source": "sns",
        "trigger.event_source_arn": "arn:aws:sns:us-east-1:123456789012:ExampleTopic",
      }, file: "sns.json"
    },
    {
      result: {
        "trigger.event_source": "sqs",
        "trigger.event_source_arn": "arn:aws:sqs:us-east-1:123456789012:MyQueue",
      }, file: "sqs.json"
    },
  ];
  it("returns the correct event source and ARN", () => {
    for (let event of events) {
      const eventData = JSON.parse(readFileSync(`./event_samples/${event.file}`, "utf8"));
      const eventSource = getEventSource(eventData);
      const eventSourceARN = getEventSourceARN(eventSource, eventData, mockContext);
      expect(eventSource).toEqual(event.result["trigger.event_source"]);
      expect(eventSourceARN).toEqual(event.result["trigger.event_source_arn"]);
    }
  });

  it("extracts all trigger tags", () => {
    for (let event of events) {
      const eventData = JSON.parse(readFileSync(`./event_samples/${event.file}`, "utf8"));
      const triggerTags = extractTriggerTags(eventData, mockContext);
      expect(triggerTags).toEqual(event.result);
    }
  });
});
