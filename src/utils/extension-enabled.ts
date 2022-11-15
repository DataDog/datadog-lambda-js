import { existsSync } from "fs";

const EXTENSION_PATH = "/opt/extensions/datadog-agent";

export function extensionEnabled() {
  return existsSync(EXTENSION_PATH);
}
