import { Context } from "aws-lambda";
import { _resetColdStart } from "../utils/cold-start";
import { getProcessVersion } from "../utils/process-version";
import { getEnhancedMetricTags, getRuntimeTag } from "./enhanced-metrics";

jest.mock("../utils/process-version");

const mockedGetProcessVersion = getProcessVersion as jest.Mock<string>;

const mockARN = "arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda";
const mockContext = {
  invokedFunctionArn: mockARN,
  memoryLimitInMB: "128",
} as any as Context;
const mockContextLocal = {
  functionName: "my-test-lambda",
  functionVersion: "1.0.0",
  memoryLimitInMB: "128",
} as any as Context;

describe("getRuntimeTag", () => {
  it("returns a null runtime tag when version is not recognized", () => {
    mockedGetProcessVersion.mockReturnValue("v6.2.3");
    expect(getRuntimeTag()).toBe(null);
  });

  it("returns the right tag for v16.15.0", () => {
    mockedGetProcessVersion.mockReturnValue("v16.15.0");
    expect(getRuntimeTag()).toBe("runtime:nodejs16.x");
  });

  it("returns the right tag for v18.12.0", () => {
    mockedGetProcessVersion.mockReturnValue("v18.12.0");
    expect(getRuntimeTag()).toBe("runtime:nodejs18.x");
  });

  it("returns the right tag for v20.9.0", () => {
    mockedGetProcessVersion.mockReturnValue("v20.9.0");
    expect(getRuntimeTag()).toBe("runtime:nodejs20.x");
  });
});

describe("getEnhancedMetricTags", () => {
  beforeEach(() => {
    _resetColdStart();
  });
  afterEach(() => {
    _resetColdStart();
  });

  it("generates tag list with runtime", () => {
    mockedGetProcessVersion.mockReturnValue("v20.9.0");
    expect(getEnhancedMetricTags(mockContext)).toStrictEqual([
      "region:us-east-1",
      "account_id:123497598159",
      "functionname:my-test-lambda",
      "resource:my-test-lambda",
      "memorysize:128",
      "cold_start:true",
      "datadog_lambda:vX.X.X",
      "runtime:nodejs20.x",
    ]);
  });

  it("generates tag list with local runtime", () => {
    mockedGetProcessVersion.mockReturnValue("v20.9.0");
    expect(getEnhancedMetricTags(mockContextLocal)).toStrictEqual([
      "functionname:my-test-lambda",
      "memorysize:128",
      "cold_start:true",
      "datadog_lambda:vX.X.X",
      "runtime:nodejs20.x",
    ]);
  });

  it("doesn't add runtime tag if version is unrecognized", () => {
    mockedGetProcessVersion.mockReturnValue("v6.3.2");
    expect(getEnhancedMetricTags(mockContext)).toStrictEqual([
      "region:us-east-1",
      "account_id:123497598159",
      "functionname:my-test-lambda",
      "resource:my-test-lambda",
      "memorysize:128",
      "cold_start:true",
      "datadog_lambda:vX.X.X",
    ]);
  });

  it("doesn't add context-based tags when context not provided", () => {
    mockedGetProcessVersion.mockReturnValue("v20.9.0");
    expect(getEnhancedMetricTags()).toStrictEqual(["cold_start:true", "datadog_lambda:vX.X.X", "runtime:nodejs20.x"]);
  });
});
