import { parseLambdaARN, parseTagsFromARN } from "./arn";

describe("arn utils", () => {
  it("parses arn properties", () => {
    expect(parseLambdaARN("arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda")).toEqual({
      account_id: "123497598159",
      functionname: "my-test-lambda",
      region: "us-east-1",
    });
  });

  it("parses arn properties with version alias", () => {
    expect(parseLambdaARN("arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda:my-version-alias")).toEqual({
      account_id: "123497598159",
      functionname: "my-test-lambda",
      region: "us-east-1",
    });
  });

  it("parses arn tags", () => {
    const parsedTags = parseTagsFromARN("arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda");
    for (const tag of ["account_id:123497598159", "functionname:my-test-lambda", "region:us-east-1"]) {
      expect(parsedTags).toContain(tag);
    }
  });

  it("parses arn tags with version", () => {
    const parsedTags = parseTagsFromARN(
      "arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda:my-version-alias",
    );
    for (const tag of ["account_id:123497598159", "functionname:my-test-lambda", "region:us-east-1"]) {
      expect(parsedTags).toContain(tag);
    }
  });
});
