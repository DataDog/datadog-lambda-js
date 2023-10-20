import { datadogLambdaVersion } from "../constants";

import { Context } from "aws-lambda";
import { parseLambdaARN } from "../utils/arn";
import { getSandboxInitTags } from "../utils/cold-start";
import { MetricsListener } from "./listener";
import { objectToKeyValueArray } from "../utils/tag-object";
import { getProcessVersion } from "../utils/process-version";

const ENHANCED_LAMBDA_METRICS_NAMESPACE = "aws.lambda.enhanced";

/**
 * Runtime tag values used for enhanced metrics.
 * Same as Lambda integration metrics.
 *
 * See https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
 */
enum RuntimeTagValues {
  Node14 = "nodejs14.x",
  Node16 = "nodejs16.x",
  Node18 = "nodejs18.x",
}

/**
 * Tags available from parsing an AWS Lambda ARN
 */
interface LambdaArnMetricTags {
  // `account_id` is the key used for metric tags.
  // tslint:disable-next-line: variable-name
  account_id: string;
  region: string;
  functionname: string;
  executedversion?: string;
  resource?: string;
}

export function getEnhancedMetricTags(context: Context): string[] {
  let arnTags = [`functionname:${context.functionName}`];
  if (context.invokedFunctionArn) {
    arnTags = objectToKeyValueArray(getLambdaArnTags(context.invokedFunctionArn, context.functionVersion));
  }
  const tags = [...arnTags, ...getSandboxInitTags(), `memorysize:${context.memoryLimitInMB}`, getVersionTag()];

  const runtimeTag = getRuntimeTag();
  if (runtimeTag) {
    tags.push(runtimeTag);
  }

  return tags;
}

export function getLambdaArnTags(arn: string, version?: string): LambdaArnMetricTags {
  // tslint:disable-next-line: variable-name
  const [, region, account_id, functionname, alias] = parseLambdaARN(arn);
  let _alias = alias;
  const tags: LambdaArnMetricTags = { region, account_id, functionname, resource: functionname };

  if (alias !== undefined) {
    // If `$LATEST`, remove `$` for Datadog metrics tag convention.
    if (alias.startsWith("$")) {
      _alias = alias.substring(1);
      // Check if this is an alias and not a version.
    } else if (!Number(alias)) {
      tags.executedversion = version;
    }
    tags.resource = functionname + ":" + _alias;
  }

  return tags;
}

/**
 * Inspects `process.version` to determine in which node runtime
 * the code is running. If present, returns a `key:value` pair as
 * `runtime:nodejs18.x`.
 *
 * @returns runtime tag, null if not present.
 */
export function getRuntimeTag(): string | null {
  const processVersion = getProcessVersion();
  let tag: string | null = null;

  switch (processVersion.substring(0, 3)) {
    case "v14":
      tag = RuntimeTagValues.Node14;
      break;
    case "v16":
      tag = RuntimeTagValues.Node16;
      break;
    case "v18":
      tag = RuntimeTagValues.Node18;
      break;

    default:
      return null;
  }

  return `runtime:${tag}`;
}

export function getVersionTag(): string {
  return `datadog_lambda:v${datadogLambdaVersion}`;
}

/**
 * Increments the specified enhanced metric, applying all relevant tags
 * @param context object passed to invocation by AWS
 * @param metricName name of the enhanced metric without namespace prefix, i.e. "invocations" or "errors"
 */
function incrementEnhancedMetric(listener: MetricsListener, metricName: string, context: Context) {
  // Always write enhanced metrics to standard out
  listener.sendDistributionMetric(
    `${ENHANCED_LAMBDA_METRICS_NAMESPACE}.${metricName}`,
    1,
    true,
    ...getEnhancedMetricTags(context),
  );
}

export function incrementInvocationsMetric(listener: MetricsListener, context: Context): void {
  incrementEnhancedMetric(listener, "invocations", context);
}

export function incrementErrorsMetric(listener: MetricsListener, context: Context): void {
  incrementEnhancedMetric(listener, "errors", context);
}
