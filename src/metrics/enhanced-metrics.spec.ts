import { Context } from "aws-lambda";
import { _resetColdStart } from "../utils/cold-start";
import { getProcessVersion } from "../utils/process-version";
import { getEnhancedMetricTags, getRuntimeTag } from "./enhanced-metrics";

jest.mock("../utils/process-version");

const mockedGetProcessVersion = getProcessVersion as jest.Mock<string>;
import * as packageJson from "../../package.json";
const ddtraceVersion = packageJson.devDependencies["dd-trace"];

const mockARN = "arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda";
const mockContext = ({
  invokedFunctionArn: mockARN,
  memoryLimitInMB: "128",
} as any) as Context;
const mockContextLocal = ({
  functionName: "my-test-lambda",
  functionVersion: "1.0.0",
  memoryLimitInMB: "128",
} as any) as Context;

describe("getRuntimeTag", () => {
  it("returns a null runtime tag when version is not recognized", () => {
    mockedGetProcessVersion.mockReturnValue("v6.2.3");
    expect(getRuntimeTag()).toBe(null);
  });

  it("returns the expected tag for v8.10", () => {
    mockedGetProcessVersion.mockReturnValue("v8.10.0");
    expect(getRuntimeTag()).toBe("runtime:nodejs8.10");
  });

  it("returns the expected tag for v10.x", () => {
    mockedGetProcessVersion.mockReturnValue("v10.1.0");
    expect(getRuntimeTag()).toBe("runtime:nodejs10.x");
  });

  it("returns the right tag for v12.13.0", () => {
    mockedGetProcessVersion.mockReturnValue("v12.13.0");
    expect(getRuntimeTag()).toBe("runtime:nodejs12.x");
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
    mockedGetProcessVersion.mockReturnValue("v8.10.0");
    expect(getEnhancedMetricTags(mockContext)).toStrictEqual([
      "region:us-east-1",
      "account_id:123497598159",
      "functionname:my-test-lambda",
      "resource:my-test-lambda",
      "cold_start:true",
      "memorysize:128",
      `datadog_lambda:${packageJson.version}`,
      `dd_trace:${ddtraceVersion}`,
      "runtime:nodejs8.10",
    ]);
  });

  it("generates tag list with local runtime", () => {
    mockedGetProcessVersion.mockReturnValue("v8.10.0");
    expect(getEnhancedMetricTags(mockContextLocal)).toStrictEqual([
      "functionname:my-test-lambda",
      "cold_start:true",
      "memorysize:128",
      `datadog_lambda:${packageJson.version}`,
      `dd_trace:${ddtraceVersion}`,
      "runtime:nodejs8.10",
    ]);
  });

  it("doesn't add runtime tag if version is unrecognized", () => {
    mockedGetProcessVersion.mockReturnValue("v6.3.2");
    expect(getEnhancedMetricTags(mockContext)).toStrictEqual([
      "region:us-east-1",
      "account_id:123497598159",
      "functionname:my-test-lambda",
      "resource:my-test-lambda",
      "cold_start:true",
      "memorysize:128",
      `datadog_lambda:${packageJson.version}`,
      `dd_trace:${ddtraceVersion}`,
    ]);
  });
});
