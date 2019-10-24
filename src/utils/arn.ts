/** Parse properties of the ARN into an object */
export function parseLambdaARN(functionARN: string) {
  // Disabling variable name because account_id is the key we need to use for the tag
  // tslint:disable-next-line: variable-name
  const [, , , region, account_id, , functionname] = functionARN.split(":", 7);
  return { region, account_id, functionname };
}

/**
 * Parse keyValueObject to get the array of key:value strings to use in Datadog metric submission
 * @param obj The object whose properties and values we want to get key:value strings from
 */
function makeTagStringsFromObject(keyValueObject: { [key: string]: string }) {
  return Object.entries(keyValueObject).map(([tagKey, tagValue]) => `${tagKey}:${tagValue}`);
}

/** Get the array of "key:value" string tags from the Lambda ARN */
export function parseTagsFromARN(functionARN: string) {
  return makeTagStringsFromObject(parseLambdaARN(functionARN));
}
