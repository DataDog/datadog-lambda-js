import { datadogLambdaVersion } from "../constants";
import { sendDistributionMetric } from "../index";

import { Context } from "aws-lambda";
import { parseTagsFromARN } from "../utils/arn";
import { getColdStartTag } from "../utils/cold-start";
import { getProcessVersion } from "../utils/process-version";
import { writeMetricToStdout } from "./metric-log";
import { MetricsListener } from "./listener";

const ENHANCED_LAMBDA_METRICS_NAMESPACE = "aws.lambda.enhanced";

// Same tag strings added to normal Lambda integration metrics
enum RuntimeTagValues {
  Node14 = "nodejs14.x",
  Node16 = "nodejs16.x",
  Node18 = "nodejs18.x",
}

export function getVersionTag(): string {
  return `datadog_lambda:v${datadogLambdaVersion}`;
}

/**
 * Uses process.version to create a runtime tag
 * If a version cannot be identified, returns null
 * See https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
 */
export function getRuntimeTag(): string | null {
  const processVersion = getProcessVersion();
  let processVersionTagString: string | null = null;

  if (processVersion.startsWith("v14")) {
    processVersionTagString = RuntimeTagValues.Node14;
  }

  if (processVersion.startsWith("v16")) {
    processVersionTagString = RuntimeTagValues.Node16;
  }

  if (processVersion.startsWith("v18")) {
    processVersionTagString = RuntimeTagValues.Node18;
  }

  if (!processVersionTagString) {
    return null;
  }

  return `runtime:${processVersionTagString}`;
}

export function getEnhancedMetricTags(context: Context): string[] {
  let arnTags = [`functionname:${context.functionName}`];
  if (context.invokedFunctionArn) {
    arnTags = parseTagsFromARN(context.invokedFunctionArn, context.functionVersion);
  }
  const tags = [...arnTags, getColdStartTag(), `memorysize:${context.memoryLimitInMB}`, getVersionTag()];

  const runtimeTag = getRuntimeTag();
  if (runtimeTag) {
    tags.push(runtimeTag);
  }

  return tags;
}

/**
 * Increments the specified enhanced metric, applying all relevant tags
 * @param context object passed to invocation by AWS
 * @param metricName name of the enhanced metric without namespace prefix, i.e. "invocations" or "errors"
 */
function incrementEnhancedMetric(listener: MetricsListener, metricName: string, context: Context) {
  // Always write enhanced metrics to standard out
  listener.sendDistributionMetric(`aws.lambda.enhanced.${metricName}`, 1, true, ...getEnhancedMetricTags(context));
}

export function incrementInvocationsMetric(listener: MetricsListener, context: Context): void {
  incrementEnhancedMetric(listener, "invocations", context);
}

export function incrementErrorsMetric(listener: MetricsListener, context: Context): void {
  incrementEnhancedMetric(listener, "errors", context);
}
