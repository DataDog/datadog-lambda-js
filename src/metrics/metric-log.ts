// Builds the string representation of the metric that will be written to logs
export function buildMetricLog(name: string, value: number, tags: string[]) {
  return `${JSON.stringify({
    // Date.now() returns Unix time in milliseconds, we convert to seconds for DD API submission
    e: Date.now() / 1000,
    m: name,
    t: tags,
    v: value,
  })}\n`;
}

/**
 * Writes the specified metric to standard output
 * @param name The name of the metric
 * @param value Metric datapoint's value
 * @param tags Tags to apply to the metric
 */
export function writeMetricToStdout(name: string, value: number, tags: string[]) {
  // We use process.stdout.write, because console.log will prepend metadata to the start
  // of the log that log forwarder doesn't know how to read.
  process.stdout.write(buildMetricLog(name, value, tags));
}
