import { serializeError } from "serialize-error";

export enum LogLevel {
  DEBUG = 0,
  ERROR,
  NONE,
}

export interface Logger {
  debug(message: string): void;
  error(message: string): void;
}

let logger: Logger = console;
let logLevel = LogLevel.ERROR;

export function setLogger(customLogger: Logger) {
  logger = customLogger;
}

export function setLogLevel(level: LogLevel) {
  logLevel = level;
}

export function getLogLevel(): LogLevel {
  return logLevel;
}

export function logDebug(message: string, metadata?: Error | object, error?: Error) {
  if (logLevel > LogLevel.DEBUG) {
    return;
  }
  emitLog(logger.debug, "debug", message, metadata, error);
}

export function logError(message: string, metadata?: Error | object, error?: Error) {
  if (logLevel > LogLevel.ERROR) {
    return;
  }
  emitLog(logger.error, "error", message, metadata, error);
}

function emitLog(
  outputter: (a: string) => any,
  status: string,
  message: string,
  metadata?: object | Error,
  error?: Error,
) {
  message = `datadog:${message}`;
  let output = { status, message };
  if (metadata instanceof Error && error === undefined) {
    // allow for log*(message), log*("message", metadata), log*("message", error), and log*("message", metadata, error)
    error = metadata;
    metadata = undefined;
  }
  if (metadata !== undefined) {
    output = { ...output, ...metadata };
  }
  if (error !== undefined) {
    const errorInfo = serializeError(error);
    output = { ...output, ...errorInfo };
  }
  outputter(JSON.stringify(output));
}
