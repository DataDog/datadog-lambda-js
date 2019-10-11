import { sendDistributionMetric } from "../index";

import { parseTagsFromARN } from "../utils/arn";
import { getColdStartTag } from "../utils/cold-start";

const ENHANCED_LAMBDA_METRICS_NAMESPACE = "aws.lambda.enhanced";

export function incrementInvocationsMetric(functionARN: string): void {
  const tags = [...parseTagsFromARN(functionARN), getColdStartTag()];
  sendDistributionMetric(`${ENHANCED_LAMBDA_METRICS_NAMESPACE}.invocations`, 1, ...tags);
}

export function incrementErrorsMetric(functionARN: string): void {
  const tags = [...parseTagsFromARN(functionARN), getColdStartTag()];
  sendDistributionMetric(`${ENHANCED_LAMBDA_METRICS_NAMESPACE}.errors`, 1, ...tags);
}
