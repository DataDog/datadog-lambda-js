/**
 * Parses an AWS Lambda ARN into an array of strings.
 *
 * @param arn an AWS Lambda ARN.
 * @returns an array of strings in the form of `[lowerCaseArn, region, accountId, functionName, aliasOrVersion]`.
 */
export function parseLambdaARN(arn?: string) {
  if (arn === undefined) return [];
  const [, , , region, accountId, , functionName, alias] = arn.split(":");

  return [arn, region, accountId, functionName, alias];
}
