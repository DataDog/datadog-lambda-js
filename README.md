# datadog-lambda-js

![build](https://github.com/DataDog/datadog-lambda-js/workflows/build/badge.svg)
[![Code Coverage](https://img.shields.io/codecov/c/github/DataDog/datadog-lambda-js)](https://codecov.io/gh/DataDog/datadog-lambda-js)
[![NPM](https://img.shields.io/npm/v/datadog-lambda-js)](https://www.npmjs.com/package/datadog-lambda-js)
[![Slack](https://chat.datadoghq.com/badge.svg?bg=632CA6)](https://chat.datadoghq.com/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/DataDog/datadog-lambda-js/blob/main/LICENSE)

Datadog Lambda Library for Node.js (16.x, 18.x, and 20.x) enables enhanced Lambda metrics, distributed tracing, and custom metric submission from AWS Lambda functions.

## Installation

Follow the [installation instructions](https://docs.datadoghq.com/serverless/installation/nodejs/), and view your function's enhanced metrics, traces and logs in Datadog.

## Configuration

Follow the [configuration instructions](https://docs.datadoghq.com/serverless/configuration) to tag your telemetry, capture request/response payloads, filter or scrub sensitive information from logs or traces, and more.

For additional tracing configuration options, check out the [official documentation for Datadog trace client](https://datadoghq.dev/dd-trace-js/).

Besides the environment variables supported by dd-trace-js, the datadog-lambda-js library added following environment variables.


| Environment Variables | Description | Default Value |
| -------------------- | ------------ | ------------- |
| DD_ENCODE_AUTHORIZER_CONTEXT      | When set to `true` for Lambda authorizers, the tracing context will be encoded into the response for propagation. Supported for NodeJS and Python. | `true` |
| DD_DECODE_AUTHORIZER_CONTEXT      | When set to `true` for Lambdas that are authorized via Lambda authorizers, it will parse and use the encoded tracing context (if found). Supported for NodeJS and Python. | `true` |
| DD_COLD_START_TRACING | Set to `false` to disable Cold Start Tracing. Used in NodeJS and Python. | `true` |
| DD_MIN_COLD_START_DURATION |  Sets the minimum duration (in milliseconds) for a module load event to be traced via Cold Start Tracing. Number. | `3` |
| DD_COLD_START_TRACE_SKIP_LIB | optionally skip creating Cold Start Spans for a comma-separated list of libraries. Useful to limit depth or skip known libraries. | `./opentracing/tracer` |
| DD_CAPTURE_LAMBDA_PAYLOAD | [Captures incoming and outgoing AWS Lambda payloads][1] in the Datadog APM spans for Lambda invocations. | `false` |
| DD_CAPTURE_LAMBDA_PAYLOAD_MAX_DEPTH | Determines the level of detail captured from AWS Lambda payloads, which are then assigned as tags for the `aws.lambda` span. It specifies the nesting depth of the JSON payload structure to process. Once the specified maximum depth is reached, the tag's value is set to the stringified value of any nested elements beyond this level.  <br> For example, given the input payload: <pre>{<br>  "lv1" : {<br>    "lv2": {<br>      "lv3": "val"<br>    }<br>  }<br>}</pre> If the depth is set to `2`, the resulting tag's key is set to `function.request.lv1.lv2` and the value is `{\"lv3\": \"val\"}`. <br> If the depth is set to `0`, the resulting tag's key is set to `function.request` and value is `{\"lv1\":{\"lv2\":{\"lv3\": \"val\"}}}` | `10` |


## Lambda Profiling Beta

Datadog's [Continuous Profiler](https://www.datadoghq.com/product/code-profiling/) is now available in beta for NodeJS in version 6.87.0 and layer version 87 and above. This optional feature is enabled by setting the `DD_PROFILING_ENABLED` environment variable to `true`. During the beta period, profiling is available at no additional cost.

## Major Version Notes

### 5.x.x

The 5.x.x release introduces version 2 of the Datadog tracer, [dd-trace-js](https://github.com/DataDog/dd-trace-js/). This includes a few breaking changes, and the migration guide found [here](https://github.com/DataDog/dd-trace-js/blob/master/MIGRATING.md#nested-objects-as-tags).

The first 5.x.x version was released with Lambda Layer version `69`.

### 6.x.x

The 6.x.x release introduces support for the node 16 runtime and esm modules.

### 7.x.x

The 7.x.x release drops support for Node12, and upgrades dd-trace-js to version 3.x

### 9.x.x
The 9.x.x release changed how Lambda's traceID is hashed if the incoming payload contains Step Functions context object. This change only affects those who uses inject Step Functions context object into Lambda payload.

There is a full migration guide available [here](https://github.com/DataDog/dd-trace-js/blob/master/MIGRATING.md).
Some changes are more likely to impact Serverless users:
- `HTTP Operation Name Changed`. HTTP requests will no longer appear as a separate client under `*-http-client`, which polluted the APM service catalog.
- `tracer.currentSpan()` has been deprecated for a long time, and is now removed.
- `tracer.bindEmitter()` is similarly removed after being deprecated.
- It is no longer possible to [bind promises or event emitters with tracer.scope().bind(...)](https://github.com/DataDog/dd-trace-js/blob/master/MIGRATING.md#scope-binding-for-promises-and-event-emitters)

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
