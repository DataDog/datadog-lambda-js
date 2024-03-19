import { logDebug } from "../utils";
import fs from "fs";

export const EXTENSION_URL = "http://127.0.0.1:8124";
const EXTENSION_PATH = "/opt/extensions/datadog-agent";

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
