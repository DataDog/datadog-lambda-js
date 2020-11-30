import { URL } from "url";
import { get, post, logDebug } from "../utils";
import fs from "fs";

export const AGENT_URL = "http://127.0.0.1:8124";
const HELLO_PATH = "/lambda/hello";
const FLUSH_PATH = "/lambda/flush";
const EXTENSION_PATH = "/opt/extensions/datadog-agent";
const AGENT_TIMEOUT_MS = 100;
export async function isAgentRunning() {
  const extensionExists = await fileExists(EXTENSION_PATH);
  if (!extensionExists) {
    logDebug(`Agent isn't present in sandbox`);
    return false;
  }

  const url = new URL(HELLO_PATH, AGENT_URL);
  try {
    await get(url, { timeout: AGENT_TIMEOUT_MS });
  } catch (e) {
    logDebug(`Agent is not running, returned with error ${JSON.stringify(e)}`);
    return false;
  }
  return true;
}

export async function flushExtension() {
  const url = new URL(FLUSH_PATH, AGENT_URL);
  try {
    await post(url, {}, { timeout: AGENT_TIMEOUT_MS });
  } catch (e) {
    logDebug(`Failed to flush agent, returned with error ${e}`);
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
