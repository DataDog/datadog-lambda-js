# datadog-lambda-layer-js

![CircleCI](https://img.shields.io/circleci/build/github/DataDog/datadog-lambda-layer-js)
[![Code Coverage](https://img.shields.io/codecov/c/github/DataDog/datadog-lambda-layer-js)](https://codecov.io/gh/DataDog/datadog-lambda-layer-js)
[![NPM](https://img.shields.io/npm/v/datadog-lambda-js)](https://www.npmjs.com/package/datadog-lambda-js)
[![Slack](https://img.shields.io/badge/slack-%23serverless-blueviolet?logo=slack)](https://datadoghq.slack.com/channels/serverless/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/DataDog/datadog-lambda-layer-js/blob/master/LICENSE)

Datadog's Lambda node client library enables distributed tracing between serverful and serverless environments, as well as letting you send custom metrics to the Datadog API.

## Installation

This library is provided both as an AWS Lambda Layer, and a NPM package. If you want to get off the ground quickly and don't need to
bundle your dependencies locally, the Lambda Layer method is the recommended approach.

### NPM method

You can install the package library locally with one of the following commands. Keep in mind, you will need to bundle this package with your function manually.

```bash
yarn add datadog-lambda-js # Yarn users
npm install datadog-lambda-js # NPM users
```

### Lambda Layer Method

Datadog Lambda Layer can be added to a Lambda function via AWS Lambda console, [AWS CLI](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html#configuration-layers-using) or [Serverless Framework](https://serverless.com/framework/docs/providers/aws/guide/layers/#using-your-layers) using the following ARN.

```
arn:aws:lambda:<AWS_REGION>:464622532012:layer:Datadog-Node12-x:<VERSION>
# OR
arn:aws:lambda:<AWS_REGION>:464622532012:layer:Datadog-Node10-x:<VERSION>
# OR
arn:aws:lambda:<AWS_REGION>:464622532012:layer:Datadog-Node8-10:<VERSION> # (Deprecated)
```

Replace `<AWS_REGION>` with the region where your Lambda function lives, and `<VERSION>` with the desired (or the latest) version that can be found from [CHANGELOG](https://github.com/DataDog/datadog-lambda-layer-js/releases).

### The Serverless Framework

If your Lambda function is deployed using the Serverless Framework, refer to this sample `serverless.yml`.

```yaml
provider:
  name: aws
  runtime: nodejs10.x
  tracing:
    lambda: true
    apiGateway: true

functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          method: get
    layers:
      - arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Node10-x:1
    environment:
      DD_API_KEY: xxx
```

## Environment Variables

You can set the following environment variables via the AWS CLI or Serverless Framework

### DD_API_KEY or DD_KMS_API_KEY (if encrypted by KMS)

Your datadog API key

### DD_SITE

Which Datadog site to use. Set this to `datadoghq.eu` to send your data to the Datadog EU site. Defaults to `datadoghq.com`.

### DD_LOG_LEVEL

How much logging datadog-lambda-layer-js should do. Set this to "debug" for extensive logs.

### DD_FLUSH_TO_LOG

If you have the Datadog Lambda Log forwarder enabled and are sending custom metrics, set this to true so your metrics will be sent via logs, (instead of being sent at the end of your lambda invocation).

### DD_ENHANCED_METRICS

If you set the value of this variable to "true" then the Lambda layer will increment a Lambda integration metric called `aws.lambda.enhanced.invocations` with each invocation and `aws.lambda.enhanced.errors` if the invocation results in an error. These metrics are tagged with the function name, region, account, runtime, memorysize, and `cold_start:true|false`.

### DD_LOGS_INJECTION

Controlls whether or not the request ID is injected into log lines. See [DD_LOGS_INJECTION](#DD_LOGS_INJECTION-environment-variable) under
the Trace & Log Correlation section below.

## Usage

Datadog needs to be able to read headers from the incoming Lambda event.

```typescript
const { datadog } = require("datadog-lambda-js");

async function myHandler(event, context) {
  return {
    statusCode: 200,
    body: "hello, dog!",
  };
}
// Wrap your handler function like this
module.exports.myHandler = datadog(myHandler);
/* OR with manual configuration options
module.exports.myHandler = datadog(myHandler, {
    apiKey: "my-api-key"
});
*/
```

## Custom Metrics

Custom metrics can be submitted using the `sendDistributionMetric` function. The metrics are submitted as [distribution metrics](https://docs.datadoghq.com/graphing/metrics/distributions/).

**IMPORTANT NOTE:** If you have already been submitting the same custom metric as non-distribution metric (e.g., gauge, count, or histogram) without using the Datadog Lambda Layer, you MUST pick a new metric name to use for `sendDistributionMetric`. Otherwise that existing metric will be converted to a distribution metric and the historical data prior to the conversion will be no longer queryable.

```typescript
const { sendDistributionMetric } = require("datadog-lambda-js");

sendDistributionMetric(
  "coffee_house.order_value", // Metric name
  12.45, // The Value
  "product:latte",
  "order:online", // Associated tags
);
```

### VPC

If your Lambda function is associated with a VPC, you need to ensure it has access to the [public internet](https://aws.amazon.com/premiumsupport/knowledge-center/internet-access-lambda-function/).

## Trace & Log Correlation

### Using the Datadog Tracer

If you are using the [Datadog Tracer](#datadog-tracer-experimental), your log messages
will be correlated within the appropriate traces automatically.

### Without using the Datadog Tracer

In order to correlate logs emitted by your Lambda with specific invocations, it
is necessary to add the AWS Request ID to your logs. This is done automatically
for `console.log()`, but you will have to implement this for other logging libraries.

The AWS Request ID is available in the context that is passed to your lambda handler,
as `context.awsRequestId`. It should be included in your log line as `lambda.request_id`.

For example, using the [Pino](https://getpino.io/) logger:

```typescript
const logger = require('pino')();

exports.handler = async function(event, context) {
 
  //This sets up your request-specific logger to emit logs with the Request ID property.
  const req_logger = logger.child({ 'lambda.request_id': context.awsRequestId });

  //Carry on with whatever the lambda needs to do
  const work = do.Work();

  //Write a log message
  req_logger.info("Work complete");

  return work;
}

```

### DD_LOGS_INJECTION environment variable

By default, the Datadog trace id gets automatically injected into the logs for correlation, if using `console` or a logging library supported for [automatic](https://docs.datadoghq.com/tracing/connect_logs_and_traces/?tab=nodejs#automatic-trace-id-injection)  trace id injection.

See instructions for [manual](https://docs.datadoghq.com/tracing/connect_logs_and_traces/?tab=nodejs#manual-trace-id-injection) trace id injection, if using other logging libraries.

Set the environment variable `DD_LOGS_INJECTION` to `false` to disable this feature.


## Distributed Tracing

[Distributed tracing](https://docs.datadoghq.com/tracing/guide/distributed_tracing/?tab=nodejs) allows you to propagate a trace context from a service running on a host to a service running on AWS Lambda, and vice versa, so you can see performance end-to-end. Linking is implemented by injecting Datadog trace context into the HTTP request headers.

Distributed tracing headers are language agnostic, e.g., a trace can be propagated between a Java service running on a host to a Lambda function written in Node.

Because the trace context is propagated through HTTP request headers, the Lambda function needs to be triggered by AWS API Gateway or AWS Application Load Balancer.

To enable this feature wrap your handler functions using the `datadog` function.

### Patching

By default, requests made using node's inbuilt `http` and `https` libraries, (and libraries which depend on them, such as axios), will be patched with Datadog's tracing context headers. If you would rather add these headers manually on a per request basic, you can disable patching using the autoPatchHTTP option.

```typescript
const https = require("https");
const { datadog, getTraceHeaders } = require("datadog-lambda-js");

async function myHandler(event, context) {
  // Add the headers to your request
  const headers = getTraceHeaders();
  http.get("http://www.example.com", { headers });
}

// Explicitly disable auto patching
module.exports.myHandler = datadog(myHandler, { autoPatchHTTP: false });
```

### Sampling

The traces for your Lambda function are converted by Datadog from AWS X-Ray traces. X-Ray needs to sample the traces that the Datadog tracing agent decides to sample, in order to collect as many complete traces as possible. You can create X-Ray sampling rules to ensure requests with header `x-datadog-sampling-priority:1` or `x-datadog-sampling-priority:2` via API Gateway always get sampled by X-Ray.

These rules can be created using the following AWS CLI command.

```bash
aws xray create-sampling-rule --cli-input-json file://datadog-sampling-priority-1.json
aws xray create-sampling-rule --cli-input-json file://datadog-sampling-priority-2.json
```

The file content for `datadog-sampling-priority-1.json`:

```json
{
  "SamplingRule": {
    "RuleName": "Datadog-Sampling-Priority-1",
    "ResourceARN": "*",
    "Priority": 9998,
    "FixedRate": 1,
    "ReservoirSize": 100,
    "ServiceName": "*",
    "ServiceType": "AWS::APIGateway::Stage",
    "Host": "*",
    "HTTPMethod": "*",
    "URLPath": "*",
    "Version": 1,
    "Attributes": {
      "x-datadog-sampling-priority": "1"
    }
  }
}
```

The file content for `datadog-sampling-priority-2.json`:

```json
{
  "SamplingRule": {
    "RuleName": "Datadog-Sampling-Priority-2",
    "ResourceARN": "*",
    "Priority": 9999,
    "FixedRate": 1,
    "ReservoirSize": 100,
    "ServiceName": "*",
    "ServiceType": "AWS::APIGateway::Stage",
    "Host": "*",
    "HTTPMethod": "*",
    "URLPath": "*",
    "Version": 1,
    "Attributes": {
      "x-datadog-sampling-priority": "2"
    }
  }
}
```

### Non-proxy integration

If your Lambda function is triggered by API Gateway via the non-proxy integration, then you have to set up a mapping template, which passes the Datadog trace context from the incoming HTTP request headers to the Lambda function via the event object.

If your Lambda function is deployed by the Serverless Framework, such a mapping template gets created by default.

## Datadog Tracer (**Experimental**)

You can now trace Lambda functions using Datadog APM's tracing libraries ([dd-trace-js](https://github.com/DataDog/dd-trace-js)).

1. If you are using the Lambda layer, upgrade it to at least version 9.
1. If you are using the npm package `datadog-lambda-js`, upgrade it to at least version `v0.9.0`. You also need to install the beta version of the datadog tracer: `npm install dd-trace@dev` (e.g., dd-trace@0.17.0-beta.13).
1. Install (or update to) the latest version of [Datadog forwarder Lambda function](https://docs.datadoghq.com/integrations/amazon_web_services/?tab=allpermissions#set-up-the-datadog-lambda-function). Ensure the trace forwarding layer is attached to the forwarder, e.g., ARN for Python 2.7 `arn:aws:lambda:<AWS_REGION>:464622532012:layer:Datadog-Trace-Forwarder-Python27:4`.
1. Instrument your function using `dd-trace`.
    ```js
    const { datadog } = require("datadog-lambda-js");
    const tracer = require("dd-trace").init();

    // This emits a span named "sleep"
    const sleep = tracer.wrap("sleep", (ms) => {
      return new Promise(resolve => setTimeout(resolve, ms));
    });

    exports.handler = datadog(async (event) => {
      await sleep(1000);
      const response = {
        statusCode: 200,
        body: JSON.stringify('Hello from Lambda!'),
      };
      return response;
    });
    ```
1. You can also use `dd-trace` and the X-Ray tracer together and merge the traces into one, using the `mergeDatadogXrayTraces`.
    ```js
    exports.handler = datadog(async (event) => {
      await sleep(1000);
      const response = {
        statusCode: 200,
        body: JSON.stringify('Hello from Lambda!'),
      };
      return response;
    }, { mergeDatadogXrayTraces: true });
    ```

## Opening Issues

If you encounter a bug with this package, we want to hear about it. Before opening a new issue, search the existing issues to avoid duplicates.

When opening an issue, include the Datadog Lambda Layer version, Node version, and stack trace if available. In addition, include the steps to reproduce when appropriate.

You can also open an issue for a feature request.

## Contributing

If you find an issue with this package and have a fix, please feel free to open a pull request following the [procedures](https://github.com/DataDog/dd-lambda-layer-js/blob/master/CONTRIBUTING.md).

## License

Unless explicitly stated otherwise all files in this repository are licensed under the Apache License Version 2.0.

This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2019 Datadog, Inc.
