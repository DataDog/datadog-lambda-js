let loggingEnabled = true;

export function setErrorLoggingEnabled(enabled: boolean) {
  loggingEnabled = enabled;
}

export function logError(message: string, metadata?: object) {
  if (loggingEnabled === false) {
    return;
  }
  const error = `datadog:${message}`;
  if (metadata === undefined) {
    console.warn(JSON.stringify({ error }));
  } else {
    console.warn(JSON.stringify({ ...metadata, error }));
  }
}
