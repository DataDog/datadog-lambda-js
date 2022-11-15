import { URL } from "url";
import { get, post, logDebug, logError } from "../utils";
import { extensionEnabled } from "../utils/extension-enabled";

export const AGENT_URL = "http://127.0.0.1:8124";
const HELLO_PATH = "/lambda/hello";
const FLUSH_PATH = "/lambda/flush";
const AGENT_TIMEOUT_MS = 100;

export async function isAgentRunning() {
  const extensionExists = extensionEnabled();
  if (!extensionExists) {
    logDebug(`Agent isn't present in sandbox`);
    return false;
  }

  const url = new URL(HELLO_PATH, AGENT_URL);
  const result = await get(url, { timeout: AGENT_TIMEOUT_MS });
  if (!result.success) {
    logDebug(`Could not connect to agent. ${result.errorMessage}`);
    return false;
  }
  return true;
}

export async function flushExtension(): Promise<boolean> {
  const url = new URL(FLUSH_PATH, AGENT_URL);
  const result = await post(url, {}, { timeout: AGENT_TIMEOUT_MS });
  if (!result.success) {
    logError(`Failed to flush extension. ${result.errorMessage}`);
    return false;
  }
  return true;
}
