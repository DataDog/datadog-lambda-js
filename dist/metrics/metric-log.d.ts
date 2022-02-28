export declare function buildMetricLog(name: string, value: number, metricTime: Date, tags: string[]): string;
/**
 * Writes the specified metric to standard output
 * @param name The name of the metric
 * @param value Metric datapoint's value
 * @param tags Tags to apply to the metric
 */
export declare function writeMetricToStdout(name: string, value: number, metricTime: Date, tags: string[]): void;
//# sourceMappingURL=metric-log.d.ts.map