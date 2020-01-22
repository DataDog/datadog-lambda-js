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
