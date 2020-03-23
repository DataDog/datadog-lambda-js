import { sendDistributionMetric } from "../index";

import { Context } from "aws-lambda";
import { parseTagsFromARN } from "../utils/arn";
import { getColdStartTag } from "../utils/cold-start";
import { getProcessVersion } from "../utils/process-version";
import { writeMetricToStdout } from "./metric-log";

const ENHANCED_LAMBDA_METRICS_NAMESPACE = "aws.lambda.enhanced";

// Same tag strings added to normal Lambda integration metrics
enum RuntimeTagValues {
  Node8 = "nodejs8.10",
  Node10 = "nodejs10.x",
  Node12 = "nodejs12.x",
}

/**
 * Uses process.version to create a runtime tag
 * If a version cannot be identified, returns null
 * See https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
 */
export function getRuntimeTag(): string | null {
  const processVersion = getProcessVersion();
  let processVersionTagString: string | null = null;

  if (processVersion.startsWith("v8.10")) {
    processVersionTagString = RuntimeTagValues.Node8;
  }

  if (processVersion.startsWith("v10")) {
    processVersionTagString = RuntimeTagValues.Node10;
  }

  if (processVersion.startsWith("v12")) {
    processVersionTagString = RuntimeTagValues.Node12;
  }

  if (!processVersionTagString) {
    return null;
  }

  return `runtime:${processVersionTagString}`;
}

export function getEnhancedMetricTags(context: Context): string[] {
  let arnTags = [`functionname:${context.functionName}`];
  if (context.invokedFunctionArn) {
    arnTags = parseTagsFromARN(context.invokedFunctionArn);
  }
  const tags = [...arnTags, getColdStartTag(), `memorysize:${context.memoryLimitInMB}`];

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
function incrementEnhancedMetric(metricName: string, context: Context) {
  // Always write enhanced metrics to standard out
  writeMetricToStdout(`${ENHANCED_LAMBDA_METRICS_NAMESPACE}.${metricName}`, 1, new Date(), getEnhancedMetricTags(context));
}

export function incrementInvocationsMetric(context: Context): void {
  incrementEnhancedMetric("invocations", context);
}

export function incrementErrorsMetric(context: Context): void {
  incrementEnhancedMetric("errors", context);
}
