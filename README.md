# datadog-lambda-js

![build](https://github.com/DataDog/datadog-lambda-js/workflows/build/badge.svg)
[![Code Coverage](https://img.shields.io/codecov/c/github/DataDog/datadog-lambda-js)](https://codecov.io/gh/DataDog/datadog-lambda-js)
[![NPM](https://img.shields.io/npm/v/datadog-lambda-js)](https://www.npmjs.com/package/datadog-lambda-js)
[![Slack](https://chat.datadoghq.com/badge.svg?bg=632CA6)](https://chat.datadoghq.com/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/DataDog/datadog-lambda-js/blob/main/LICENSE)

Datadog Lambda Library for Node.js (12.x, 14.x and 16.x) enables enhanced Lambda metrics, distributed tracing, and custom metric submission from AWS Lambda functions.

## Installation

Follow the [installation instructions](https://docs.datadoghq.com/serverless/installation/nodejs/), and view your function's enhanced metrics, traces and logs in Datadog.

## Configuration

Follow the [configuration instructions](https://docs.datadoghq.com/serverless/configuration) to tag your telemetry, capture request/response payloads, filter or scrub sensitive information from logs or traces, and more.

For additional tracing configuration options, check out the [official documentation for Datadog trace client](https://datadoghq.dev/dd-trace-js/).

## Major Version Notes

### 5.x.x

The 5.x.x release introduces version 2 of the Datadog tracer, [dd-trace-js](https://github.com/DataDog/dd-trace-js/). This includes a few breaking changes, and the migration guide found [here](https://github.com/DataDog/dd-trace-js/blob/master/MIGRATING.md#nested-objects-as-tags).

The first 5.x.x version was released with Lambda Layer version `69`.

### 6.x.x

The 6.x.x release introduces support for the node 16 runtime and esm modules. 

#### Breaking Changes
If you are using node 12 and installing the NPM module instead of the layer, redirecting your handler to the path `node_modules/datadog-lambda-js/dist/handler.handler` will no longer work. The path should be updated to `node_modules/datadog-lambda-js/dist/handler.handler.cjs`. This won't affect users of node 14, 16, or users of node 12 with the lambda layer.

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
