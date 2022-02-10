# datadog-lambda-js

![build](https://github.com/DataDog/datadog-lambda-js/workflows/build/badge.svg)
[![Code Coverage](https://img.shields.io/codecov/c/github/DataDog/datadog-lambda-js)](https://codecov.io/gh/DataDog/datadog-lambda-js)
[![NPM](https://img.shields.io/npm/v/datadog-lambda-js)](https://www.npmjs.com/package/datadog-lambda-js)
[![Slack](https://chat.datadoghq.com/badge.svg?bg=632CA6)](https://chat.datadoghq.com/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/DataDog/datadog-lambda-js/blob/main/LICENSE)

Datadog Lambda Library for Node.js (12.x and 14.x) enables enhanced Lambda metrics, distributed tracing, and custom metric submission from AWS Lambda functions.

## Installation

Follow the [installation instructions](https://docs.datadoghq.com/serverless/installation/nodejs/), and view your function's enhanced metrics, traces and logs in Datadog.

## Custom Metrics

Once [installed](#installation), you should be able to submit custom metrics from your Lambda function.

Check out the instructions for [submitting custom metrics from AWS Lambda functions](https://docs.datadoghq.com/integrations/amazon_lambda/?tab=nodejs#custom-metrics).

## Tracing

Once [installed](#installation), you should be able to view your function's traces in Datadog.

For additional details on trace collection, take a look at [collecting traces from AWS Lambda functions](https://docs.datadoghq.com/integrations/amazon_lambda/?tab=nodejs#trace-collection).

For additional details on trace and log connection, check out the [official documentation for Datadog trace client](https://datadoghq.dev/dd-trace-js/).

### Plugins

The `fs` module is disabled by default. If you want to enable it you have to set the environment variable `DD_TRACE_DISABLED_PLUGINS` to `''` or to a comma-separated list of the plugins you want to disable. See the full list of supported plugins [here](https://docs.datadoghq.com/tracing/compatibility_requirements/nodejs/).

### Tracer Initialization

By default, the Datadog Lambda library automatically initializes the tracer. However, you can follow the steps below to initialize the tracer with [custom settings](https://datadoghq.dev/dd-trace-js/#tracer-settings) in your own function code.

1. Set enviornment variable `DD_TRACE_ENABLED` to `false`, so the Datadog Lambda library does not initialize the tracer.
1. Add the following snippet to the function code to manually initialize the tracer with your desired settings.
   ```js
   const tracer = require("dd-trace").init({
     enabled: true,
     tags: {
       "_dd.origin": "lambda",
     },
     sampleRate: 0.1, // e.g., keep 10% of traces
   });
   ```

### Trace & Log Correlation

By default, the Datadog trace id gets automatically injected into the logs for correlation, if using `console` or a logging library supported for automatic trace id injection. You have to manually inject the trace id, if using other logging libraries. See additional details on [connecting logs and traces](https://docs.datadoghq.com/tracing/connect_logs_and_traces/nodejs/).

Set the environment variable `DD_LOGS_INJECTION` to `false` to disable this feature.

## Handler wrapper

In order to instrument individual invocations, the Datadog Lambda library needs to wrap around your Lambda handler function. This is usually achieved by pointing your function's handler setting to the provided Datadog handler function and passing the original handler function through an environment variable to be called by the Datadog handler.

If this method doesn't work for you, instead of overriding the handler and setting the `DD_LAMBDA_HANDLER` environment variable, you can apply the Datadog Lambda library wrapper in your function code like below:

```js
const { datadog } = require("datadog-lambda-js");
const tracer = require("dd-trace").init({});

module.exports.myHandler = datadog(myHandler, {
  // my function code
});
```

## Custom logger

You can use your own logger to log layer error and debug logs instead of default `console`
usage.

For example, using the [Pino](https://getpino.io/) logger:

```typescript
const { datadog } = require("datadog-lambda-js");
const logger = require("pino")();

// convert message string to object metadata and message
const messageToObject = (stringMessage) => {
  const { message, status, ...metadata } = JSON.parse(stringMessage);

  return [metadata, message];
};

async function myHandler(event, context) {
  // ...
}

// Use your own logger
module.exports.myHandler = datadog(myHandler, {
  logger: {
    debug: (message) => logger.debug(...messageToObject(message)),
    error: (message) => logger.error(...messageToObject(message)),
  },
});
```

## Environment Variables

### DD_FLUSH_TO_LOG

Set to `true` (recommended) to send custom metrics asynchronously (with no added latency to your Lambda function executions) through CloudWatch Logs with the help of [Datadog Forwarder](https://github.com/DataDog/datadog-serverless-functions/tree/master/aws/logs_monitoring). Defaults to `false`. If set to `false`, you also need to set `DD_API_KEY` and `DD_SITE`.

### DD_API_KEY

If `DD_FLUSH_TO_LOG` is set to `false` (not recommended), the Datadog API Key must be defined by setting one of the following environment variables:

- DD_API_KEY - the Datadog API Key in plain-text, NOT recommended
- DD_KMS_API_KEY - the KMS-encrypted API Key, requires the `kms:Decrypt` permission

### DD_SITE

If `DD_FLUSH_TO_LOG` is set to `false` (not recommended), you must set `DD_SITE`. Possible values are `datadoghq.com`, `datadoghq.eu`, `us3.datadoghq.com`, `us5.datadoghq.com`, and `ddog-gov.com`. The default is `datadoghq.com`.

### DD_LOG_LEVEL

Set to `debug` enable debug logs from the Datadog Lambda Library. Defaults to `info`.

### DD_ENHANCED_METRICS

Generate enhanced Datadog Lambda integration metrics, such as, `aws.lambda.enhanced.invocations` and `aws.lambda.enhanced.errors`. Defaults to `true`.

### DD_LAMBDA_HANDLER

Location of your original Lambda handler.

### DD_TRACE_ENABLED

Initialize the Datadog tracer when set to `true`. Defaults to `false`.

### DD_LOGS_INJECTION

Inject Datadog trace id into logs for correlation. Defaults to `true`.

### DD_MERGE_XRAY_TRACES

Set to `true` to merge the X-Ray trace and the Datadog trace, when using both the X-Ray and Datadog tracing. Defaults to `false`.

### DD_TRACE_MANAGED_SERVICES

Create inferred spans for managed services. Defaults to `true`.

## Major Version Notes

### 5.0

The 5.0 release introduces version 2 of the Datadog tracer, [dd-trace-js](https://github.com/DataDog/dd-trace-js/). This includes a few breaking changes, and the migration guide found [here](https://github.com/DataDog/dd-trace-js/blob/master/MIGRATING.md#nested-objects-as-tags).

5.0 was released with Lambda Layer version `69`.

## Opening Issues

If you encounter a bug with this package, we want to hear about it. Before opening a new issue, search the existing issues to avoid duplicates.

When opening an issue, include the Datadog Lambda Layer version, Node version, and stack trace if available. In addition, include the steps to reproduce when appropriate.

You can also open an issue for a feature request.

## Contributing

If you find an issue with this package and have a fix, please feel free to open a pull request following the [procedures](https://github.com/DataDog/dd-lambda-js/blob/main/CONTRIBUTING.md).

## Community

For product feedback and questions, join the `#serverless` channel in the [Datadog community on Slack](https://chat.datadoghq.com/).

## License

Unless explicitly stated otherwise all files in this repository are licensed under the Apache License Version 2.0.

This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2019 Datadog, Inc.
