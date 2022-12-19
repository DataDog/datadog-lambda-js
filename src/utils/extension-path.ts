import { existsSync } from "fs";
const EXTENSION_PATH = "/opt/extensions/datadog-agent";
let isExtension: boolean;

export function getExtensionPath() {
  return EXTENSION_PATH;
}

export function isExtensionEnabled(): boolean {
  if (isExtension !== undefined) {
    return isExtension;
  }

  const extensionPath = getExtensionPath();
  isExtension = existsSync(extensionPath);
  return isExtension;
}
