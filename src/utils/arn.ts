import { stringify } from "querystring";

/** Parse properties of the ARN into an object */
interface Tags {
  region: string;
  accountId: string;
  functionName: string;
  executedversion?: string;
  resource?: string;
}

export function parseLambdaARN(arn: string, version?: string) {
  // Disabling variable name because accountId is the key we need to use for the tag
  // tslint:disable-next-line: variable-name
  let region: string | null = null;
  let accountId: string | null = null;
  let functionName: string | null = null;
  let alias: string | null = null;

  const splitArn = arn.split(":");
  // If we have a version or alias let's declare it
  splitArn.length === 8
    ? ([, , , region, accountId, , functionName, alias] = splitArn)
    : ([, , , region, accountId, , functionName] = splitArn);
  // Set the standard tags
  const tags: Tags = { region, accountId, functionName };
  // If we have an alias...
  if (alias !== null) {
    // Check if $Latest and remove $ for datadog tag convention.
    if (alias.startsWith("$")) {
      alias = alias.substring(1);
      // Check if this is an alias and not a version.
    } else if (!Number(alias)) {
      tags.executedversion = version;
    }
    tags.resource = functionName + ":" + alias;
  } else {
    tags.resource = functionName;
  }

  return tags;
}

/**
 * Parse keyValueObject to get the array of key:value strings to use in Datadog metric submission
 * @param obj The object whose properties and values we want to get key:value strings from
 */
function makeTagStringsFromObject(tags: Tags) {
  return Object.entries(tags).map(([tagKey, tagValue]) => `${tagKey}:${tagValue}`);
}

/** Get the array of "key:value" string tags from the Lambda ARN */
export function parseTagsFromARN(arn: string, version?: string) {
  return makeTagStringsFromObject(parseLambdaARN(arn, version));
}
