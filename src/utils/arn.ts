import { stringify } from "querystring";

/** Parse properties of the ARN into an object */

interface Tags {
  // Disabling variable name because accountId is the key we need to use for the tag
  // tslint:disable-next-line: variable-name
  account_id: string;
  region: string;
  functionname: string;
  executedversion?: string;
  resource?: string;
}

export function parseLambdaARN(arn: string, version?: string) {
  let region: string | null = null;
  // tslint:disable-next-line: variable-name
  let account_id: string | null = null;
  let functionname: string | null = null;
  let alias: string | null = null;

  const splitArn = arn.split(":");
  // If we have a version or alias let's declare it
  splitArn.length === 8
    ? ([, , , region, account_id, , functionname, alias] = splitArn)
    : ([, , , region, account_id, , functionname] = splitArn);
  // Set the standard tags
  const tags: Tags = { region, account_id, functionname };
  // If we have an alias...
  if (alias !== null) {
    // Check if $Latest and remove $ for datadog tag convention.
    if (alias.startsWith("$")) {
      alias = alias.substring(1);
      // Check if this is an alias and not a version.
    } else if (!Number(alias)) {
      tags.executedversion = version;
    }
    tags.resource = functionname + ":" + alias;
  } else {
    tags.resource = functionname;
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
