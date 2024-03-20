import { URL } from "url";
import { logDebug, logError } from "../utils";
import fs from "fs";

export const EXTENSION_URL = "http://127.0.0.1:8124";
const EXTENSION_PATH = "/opt/extensions/datadog-agent";
const LOCAL_FLUSH_TIMEOUT_MS = 100;
const LOCAL_FLUSH_PATH = "/lambda/flush";

export async function isExtensionRunning() {
  const extensionExists = await fileExists(EXTENSION_PATH);
  if (!extensionExists) {
    logDebug(`Extension Layer is not present.`);
    return false;
  }
  return true;
}

function fileExists(filename: string): Promise<boolean> {
  return fs.promises
    .access(filename, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

export async function flushExtension(localTesting = false) {
  if (localTesting) {
    try {
      const { post } = require("../utils/request");
      const url = new URL(LOCAL_FLUSH_PATH, EXTENSION_URL);
      const result = await post(url, {}, { timeout: LOCAL_FLUSH_TIMEOUT_MS });
      if (!result.success) {
        logError(`Failed to flush extension. ${result.errorMessage}`);
      }

      return true;
    } catch (error) {
      if (error instanceof Error) {
        logError("Failed to flush extension", error);
      }
    }
  }

  return false;
}
