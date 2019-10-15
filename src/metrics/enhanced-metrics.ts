import { getEnvValue, sendDistributionMetric } from "../index";

import { parseTagsFromARN } from "../utils/arn";
import { getColdStartTag } from "../utils/cold-start";

const ENHANCED_LAMBDA_METRICS_NAMESPACE = "aws.lambda.enhanced";

function areEnhancedMetricsEnabled() {
  return getEnvValue("DD_ENHANCED_METRICS", "false").toLowerCase() === "true";
}

export function incrementInvocationsMetric(functionARN: string): void {
  if (!areEnhancedMetricsEnabled()) {
    return;
  }
  const tags = [...parseTagsFromARN(functionARN), getColdStartTag()];
  sendDistributionMetric(`${ENHANCED_LAMBDA_METRICS_NAMESPACE}.invocations`, 1, ...tags);
}

export function incrementErrorsMetric(functionARN: string): void {
  if (!areEnhancedMetricsEnabled()) {
    return;
  }
  const tags = [...parseTagsFromARN(functionARN), getColdStartTag()];
  sendDistributionMetric(`${ENHANCED_LAMBDA_METRICS_NAMESPACE}.errors`, 1, ...tags);
}
