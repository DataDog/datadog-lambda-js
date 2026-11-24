import fs from "fs";
import { logDebug } from "./log";

const BASE_URL_ENV_VAR = "DD_FEATURE_FLAGS_CONFIGURATION_SOURCE_AGENTLESS_BASE_URL";

// The extension forwards feature flag config requests with the API key it
// resolved (e.g. from DD_API_KEY_SECRET_ARN). Only use it when no API key is
// set: an extension without that route returns 404, and the tracer does not
// fall back to the default endpoint. dd-trace reads DATADOG_API_KEY as an alias.
export function setFeatureFlagsBaseUrl() {
  if (
    fs.existsSync("/opt/extensions/datadog-agent") &&
    !process.env.DD_API_KEY?.trim() &&
    !process.env.DATADOG_API_KEY?.trim() &&
    !process.env[BASE_URL_ENV_VAR]?.trim()
  ) {
    process.env[BASE_URL_ENV_VAR] = "http://127.0.0.1:8126";
    logDebug("set feature flags configuration base URL to the extension");
  }
}
