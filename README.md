# datadog-lambda-layer-js

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
arn:aws:lambda:<AWS_REGION>:464622532012:layer:Datadog-Node10-x:<VERSION>
# OR
arn:aws:lambda:<AWS_REGION>:464622532012:layer:Datadog-Node8-10:<VERSION>
```

Replace `<AWS_REGION>` with the region where your Lambda function lives, and `<VERSION>` with the desired (or the latest) version that can be found from [CHANGELOG](CHANGELOG.md).

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
      - arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Python37:1
    environment:
      DATADOG_API_KEY: xxx
```

## Environment Variables

You can set the following environment variables via the AWS CLI or Serverless Framework

### DD_API_KEY or DD_KMS_API_KEY (if encrypted by KMS)

Your datadog API key

### DD_SITE

Which Datadog site to use. Set this to `datadoghq.eu` to send your data to the Datadog EU site. Defaults to `datadoghq.com`.

### DD_LOG_LEVEL

How much logging datadog-lambda-layer-js should do. Set this to "debug" for extensive logs.

## Usage

Datadog needs to be able to read headers from the incoming Lambda event.

```typescript
import { datadog } from "datadog-lambda-js";

async function myHandler(event, context) {
  return {
    statusCode: 200,
    body: "hello, dog!",
  };
}
// Wrap your handler function like this
exports.exports.myHandler = datadog(myHandler);
/* OR with manual configuration options
exports.exports.myHandler = datadog(myHandler, {
    apiKey: "my-api-key"
});
*/
```

## Custom Metrics

Custom metrics can be submitted using the `sendDistributionMetric` function. The metrics are submitted as [distribution metrics](https://docs.datadoghq.com/graphing/metrics/distributions/).

```typescript
import { sendDistributionMetric } from "datadog-lambda-js";

sendDistributionMetric(
    "coffee_house.order_value", // Metric name
    12.45, // The Value
    "product:latte", "order:online" // Associated tags
```

### VPC

If your Lambda function is associated with a VPC, you need to ensure it has access to the [public internet](https://aws.amazon.com/premiumsupport/knowledge-center/internet-access-lambda-function/).

## Distributed Tracing

[Distributed tracing](https://docs.datadoghq.com/tracing/guide/distributed_tracing/?tab=python) allows you to propagate a trace context from a service running on a host to a service running on AWS Lambda, and vice versa, so you can see performance end-to-end. Linking is implemented by injecting Datadog trace context into the HTTP request headers.

Distributed tracing headers are language agnostic, e.g., a trace can be propagated between a Java service running on a host to a Lambda function written in Node.

Because the trace context is propagated through HTTP request headers, the Lambda function needs to be triggered by AWS API Gateway or AWS Application Load Balancer.

To enable this feature wrap your handler functions using the `datadog` function.

### Patching

By default, requests made using node's inbuilt `http` and `https` libraries, (and libraries which depend on them, such as axios), will be patched with Datadog's tracing context headers. If you would rather add these headers manually on a per request basic, you can disable patching using the autoPatchHTTP option.

```typescript
import http from "http";
import { sendDistributionMetric } from "datadog-lambda-js";

async function myHandler(event, context) {
  // Add the headers to your request
  const headers = getTraceHeaders();
  http.get("http://www.example.com", { headers });
}

// Explicitly disable auto patching
exports.exports.myHandler = datadog(myHandler, { autoPatchHTTP: false });
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

## Non-proxy integration

If your Lambda function is triggered by API Gateway via the non-proxy integration, then you have to set up a mapping template, which passes the Datadog trace context from the incoming HTTP request headers to the Lambda function via the event object.

If your Lambda function is deployed by the Serverless Framework, such a mapping template gets created by default.

## Opening Issues

If you encounter a bug with this package, we want to hear about it. Before opening a new issue, search the existing issues to avoid duplicates.

When opening an issue, include the Datadog Lambda Layer version, Python version, and stack trace if available. In addition, include the steps to reproduce when appropriate.

You can also open an issue for a feature request.

## Contributing

If you find an issue with this package and have a fix, please feel free to open a pull request following the [procedures](https://github.com/DataDog/dd-lambda-layer-js/blob/master/CONTRIBUTING.md).

## License

Unless explicitly stated otherwise all files in this repository are licensed under the Apache License Version 2.0.

This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2019 Datadog, Inc.
