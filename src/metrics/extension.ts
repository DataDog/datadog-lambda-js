import { logDebug } from "../utils";
import fs from "fs";

export const AGENT_URL = "http://127.0.0.1:8124";
const EXTENSION_PATH = "/opt/extensions/datadog-agent";

export async function isAgentRunning() {
  const extensionExists = await fileExists(EXTENSION_PATH);
  if (!extensionExists) {
    logDebug(`Agent isn't present in sandbox`);
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
