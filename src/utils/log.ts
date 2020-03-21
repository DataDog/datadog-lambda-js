export enum LogLevel {
  DEBUG = 0,
  ERROR,
  NONE,
}

let logger = console;
let logLevel = LogLevel.ERROR;

export function setLogger(customLogger: any) {
  logger = customLogger;
}

export function setLogLevel(level: LogLevel) {
  logLevel = level;
}

export function getLogLevel(): LogLevel {
  return logLevel;
}

export function logDebug(message: string, metadata?: object) {
  if (logLevel > LogLevel.DEBUG) {
    return;
  }
  message = `datadog:${message}`;
  if (metadata === undefined) {
    logger.debug(JSON.stringify({ status: "debug", message }));
  } else {
    logger.debug(JSON.stringify({ ...metadata, status: "debug", message }));
  }
}

export function logError(message: string, metadata?: object) {
  if (logLevel > LogLevel.ERROR) {
    return;
  }
  message = `datadog:${message}`;
  if (metadata === undefined) {
    logger.error(JSON.stringify({ status: "error", message }));
  } else {
    logger.error(JSON.stringify({ ...metadata, status: "error", message }));
  }
}
