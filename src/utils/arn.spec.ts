import { parseLambdaARN } from "./arn";

describe("arn", () => {
  describe("parseLambdaARN", () => {
    it("parses all ARN properties", () => {
      const result = parseLambdaARN("arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda:$LATEST");
      expect(result).toEqual([
        "arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda:$LATEST",
        "us-east-1",
        "123497598159",
        "my-test-lambda",
        "$LATEST",
      ]);
    });

    it("parses ARN without version", () => {
      const result = parseLambdaARN(
        "arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda-no-alias-or-version",
      );
      expect(result).toEqual([
        "arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda-no-alias-or-version",
        "us-east-1",
        "123497598159",
        "my-test-lambda-no-alias-or-version",
        undefined,
      ]);
    });

    it("returns empty array when ARN is undefined", () => {
      const result = parseLambdaARN(undefined);
      expect(result).toEqual([]);
    });
  });
});
