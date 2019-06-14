export enum LogLevel {
  DEBUG = 0,
  ERROR,
  NONE,
}

let logLevel = LogLevel.ERROR;

export function setLogLevel(level: LogLevel) {
  logLevel = level;
}

export function logDebug(message: string, metadata?: object) {
  if (logLevel > LogLevel.DEBUG) {
    return;
  }
  message = `datadog:${message}`;
  if (metadata === undefined) {
    console.warn(JSON.stringify({ status: "debug", message }));
  } else {
    console.warn(JSON.stringify({ ...metadata, status: "debug", message }));
  }
}

export function logError(message: string, metadata?: object) {
  if (logLevel > LogLevel.ERROR) {
    return;
  }
  message = `datadog:${message}`;
  if (metadata === undefined) {
    console.error(JSON.stringify({ status: "error", message }));
  } else {
    console.error(JSON.stringify({ ...metadata, status: "error", message }));
  }
}
