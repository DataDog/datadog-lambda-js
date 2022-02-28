/** Parse properties of the ARN into an object */
interface Tags {
    account_id: string;
    region: string;
    functionname: string;
    executedversion?: string;
    resource?: string;
}
export declare function parseLambdaARN(arn: string, version?: string): Tags;
/** Get the array of "key:value" string tags from the Lambda ARN */
export declare function parseTagsFromARN(arn: string, version?: string): string[];
export {};
//# sourceMappingURL=arn.d.ts.map