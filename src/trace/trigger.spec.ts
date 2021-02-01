import { parseEventSource, parseEventSourceARN, extractTriggerTags, extractHTTPStatusCodeTag } from "./trigger";
import { readFileSync } from "fs";

import { Context } from "aws-lambda";

const mockARN = "arn:aws:lambda:us-east-1:123456789012:function:test-nodejs-lambda";
const mockContext = ({
  invokedFunctionArn: mockARN,
} as any) as Context;

describe("parseEventSource", () => {
  const events = [
    {
      result: {
        "function_trigger.event_source": "api-gateway",
        "function_trigger.event_source_arn": "arn:aws:apigateway:us-east-1::/restapis/1234567890/stages/prod",
        "http.url": "70ixmpl4fl.execute-api.us-east-2.amazonaws.com",
        "http.url_details.path": "/prod/path/to/resource",
        "http.method": "POST",
      },
      file: "api-gateway.json",
    },
    {
      result: {
        "function_trigger.event_source": "application-load-balancer",
        "function_trigger.event_source_arn":
          "arn:aws:elasticloadbalancing:us-east-2:123456789012:targetgroup/lambda-xyz/123abc",
        "http.url_details.path": "/lambda",
        "http.method": "GET",
      },
      file: "application-load-balancer.json",
    },
    {
      result: {
        "function_trigger.event_source": "cloudfront",
        "function_trigger.event_source_arn": "arn:aws:cloudfront::123456789012:distribution/EXAMPLE",
      },
      file: "cloudfront.json",
    },
    {
      result: {
        "function_trigger.event_source": "cloudwatch-events",
        "function_trigger.event_source_arn": "arn:aws:events:us-east-1:123456789012:rule/ExampleRule",
      },
      file: "cloudwatch-events.json",
    },
    {
      result: {
        "function_trigger.event_source": "cloudwatch-logs",
        "function_trigger.event_source_arn": "arn:aws:logs:us-east-1:123456789012:log-group:testLogGroup",
      },
      file: "cloudwatch-logs.json",
    },
    { result: {}, file: "custom.json" },
    {
      result: {
        "function_trigger.event_source": "dynamodb",
        "function_trigger.event_source_arn":
          "arn:aws:dynamodb:us-east-1:123456789012:table/ExampleTableWithStream/stream/2015-06-27T00:48:05.899",
      },
      file: "dynamodb.json",
    },
    {
      result: {
        "function_trigger.event_source": "kinesis",
        "function_trigger.event_source_arn": "arn:aws:kinesis:EXAMPLE",
      },
      file: "kinesis.json",
    },
    {
      result: {
        "function_trigger.event_source": "s3",
        "function_trigger.event_source_arn": "arn:aws:s3:::example-bucket",
      },
      file: "s3.json",
    },
    {
      result: {
        "function_trigger.event_source": "sns",
        "function_trigger.event_source_arn": "arn:aws:sns:us-east-1:123456789012:ExampleTopic",
      },
      file: "sns.json",
    },
    {
      result: {
        "function_trigger.event_source": "sqs",
        "function_trigger.event_source_arn": "arn:aws:sqs:us-east-1:123456789012:MyQueue",
      },
      file: "sqs.json",
    },
  ];

  const responses = [
    {
      responseBody: {
        statusCode: 200,
        body: '"Hello from Lambda!"',
      },
      expectedStatusCode: "200",
    },
    {
      responseBody: {
        statusCode: 404,
        body: '"NOT FOUND"',
      },
      expectedStatusCode: "404",
    },
    {
      responseBody: undefined,
      expectedStatusCode: "502",
    },
  ];

  it("returns the correct event source and ARN", () => {
    for (let event of events) {
      const eventData = JSON.parse(readFileSync(`./event_samples/${event.file}`, "utf8"));
      const eventSource = parseEventSource(eventData);
      const eventSourceARN = parseEventSourceARN(eventSource, eventData, mockContext);
      expect(eventSource).toEqual(event.result["function_trigger.event_source"]);
      expect(eventSourceARN).toEqual(event.result["function_trigger.event_source_arn"]);
    }
  });

  it("extracts all trigger tags", () => {
    for (let event of events) {
      const eventData = JSON.parse(readFileSync(`./event_samples/${event.file}`, "utf8"));
      const triggerTags = extractTriggerTags(eventData, mockContext);
      expect(triggerTags).toEqual(event.result);
    }
  });

  it("extracts the status code if API Gateway or ALB, otherwise do nothing", () => {
    for (let event of events) {
      const eventData = JSON.parse(readFileSync(`./event_samples/${event.file}`, "utf8"));
      const triggerTags = extractTriggerTags(eventData, mockContext);
      for (let response of responses) {
        const statusCode = extractHTTPStatusCodeTag(triggerTags, response.responseBody);
        // We should always return a status code for API Gateway and ALB
        if (["api-gateway.json", "application-load-balancer.json"].includes(event.file)) {
          expect(statusCode).toEqual(response.expectedStatusCode);
        } else {
          expect(statusCode).toBeUndefined();
        }
      }
    }
  });
});
