import fs from "fs";
import { setFeatureFlagsBaseUrl } from "./feature-flags";

const BASE_URL_ENV_VAR = "DD_FEATURE_FLAGS_CONFIGURATION_SOURCE_AGENTLESS_BASE_URL";

describe("setFeatureFlagsBaseUrl", () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it.each([
    [true, {}, "http://127.0.0.1:8126"],
    [true, { DD_API_KEY: "" }, "http://127.0.0.1:8126"],
    [true, { DD_API_KEY: "  " }, "http://127.0.0.1:8126"],
    [true, { DD_API_KEY_SECRET_ARN: "arn" }, "http://127.0.0.1:8126"],
    [true, { DD_API_KEY: "key" }, undefined],
    [true, { DATADOG_API_KEY: "key" }, undefined],
    [true, { [BASE_URL_ENV_VAR]: "http://custom" }, "http://custom"],
    [false, {}, undefined],
  ])("extension=%s env=%j sets %s", (extension, env, expected) => {
    process.env = { ...env };
    jest.spyOn(fs, "existsSync").mockReturnValue(extension);

    setFeatureFlagsBaseUrl();

    expect(process.env[BASE_URL_ENV_VAR]).toBe(expected);
  });
});
