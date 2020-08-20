import { URL } from "url";
import { get, post, logDebug } from "../utils";

export const AGENT_URL = "http://127.0.0.1:8124";
const HELLO_PATH = "/lambda/hello";
const FLUSH_PATH = "/lambda/flush";
const AGENT_TIMEOUT_MS = 100;
export async function isAgentRunning() {
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
