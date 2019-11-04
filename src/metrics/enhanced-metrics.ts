import { getEnvValue, sendDistributionMetric } from "../index";

import { Context } from "aws-lambda";
import { parseTagsFromARN } from "../utils/arn";
import { getColdStartTag } from "../utils/cold-start";
import { getProcessVersion } from "../utils/process-version";

const ENHANCED_LAMBDA_METRICS_NAMESPACE = "aws.lambda.enhanced";

// Same tag strings added to normal Lambda integration metrics
enum RuntimeTagValues {
  Node8 = "nodejs8.10",
  Node10 = "nodejs10.x",
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

  if (!processVersionTagString) {
    return null;
  }

  return `runtime:${processVersionTagString}`;
}

export function getEnhancedMetricTags(context: Context): string[] {
  const tags = [
    ...parseTagsFromARN(context.invokedFunctionArn),
    getColdStartTag(),
    `memorysize:${context.memoryLimitInMB}`,
  ];

  const runtimeTag = getRuntimeTag();
  if (runtimeTag) {
    tags.push(runtimeTag);
  }

  return tags;
}

export function incrementInvocationsMetric(context: Context): void {
  sendDistributionMetric(`${ENHANCED_LAMBDA_METRICS_NAMESPACE}.invocations`, 1, ...getEnhancedMetricTags(context));
}

export function incrementErrorsMetric(context: Context): void {
  sendDistributionMetric(`${ENHANCED_LAMBDA_METRICS_NAMESPACE}.errors`, 1, ...getEnhancedMetricTags(context));
}
