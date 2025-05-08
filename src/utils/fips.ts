import { logDebug } from "./log";

export const AWS_REGION = process.env.AWS_REGION ?? "";
const isGovRegion = AWS_REGION.startsWith("us-gov-");

// Determine FIPS mode default (enabled in Gov regions) and override via env var
const defaultFips = isGovRegion ? "true" : "false";
const rawFipsEnv = process.env.DD_LAMBDA_FIPS_MODE ?? defaultFips;
export const FIPS_MODE_ENABLED = rawFipsEnv.toLowerCase() === "true";

if (isGovRegion || FIPS_MODE_ENABLED) {
  logDebug(`Node Lambda Layer FIPS mode is ${FIPS_MODE_ENABLED ? "enabled" : "not enabled"}.`);
}
