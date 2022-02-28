"use strict";
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTagsFromARN = exports.parseLambdaARN = void 0;
function parseLambdaARN(arn, version) {
    var _a;
    var region;
    // tslint:disable-next-line: variable-name
    var account_id;
    var functionname;
    var alias;
    var splitArn = arn.split(":");
    // If we have a version or alias let's declare it
    _a = __read(splitArn, 8), region = _a[3], account_id = _a[4], functionname = _a[6], alias = _a[7];
    // Set the standard tags
    var tags = { region: region, account_id: account_id, functionname: functionname };
    // If we have an alias...
    if (alias !== undefined) {
        // Check if $Latest and remove $ for datadog tag convention.
        if (alias.startsWith("$")) {
            alias = alias.substring(1);
            // Check if this is an alias and not a version.
        }
        else if (!Number(alias)) {
            tags.executedversion = version;
        }
        tags.resource = functionname + ":" + alias;
    }
    else {
        tags.resource = functionname;
    }
    return tags;
}
exports.parseLambdaARN = parseLambdaARN;
/**
 * Parse keyValueObject to get the array of key:value strings to use in Datadog metric submission
 * @param obj The object whose properties and values we want to get key:value strings from
 */
function makeTagStringsFromObject(tags) {
    return Object.entries(tags).map(function (_a) {
        var _b = __read(_a, 2), tagKey = _b[0], tagValue = _b[1];
        return "".concat(tagKey, ":").concat(tagValue);
    });
}
/** Get the array of "key:value" string tags from the Lambda ARN */
function parseTagsFromARN(arn, version) {
    return makeTagStringsFromObject(parseLambdaARN(arn, version));
}
exports.parseTagsFromARN = parseTagsFromARN;
//# sourceMappingURL=arn.js.map