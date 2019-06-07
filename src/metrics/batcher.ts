import { APIMetric, Metric, MetricKey } from "./model";

/**
 * Batcher joins metrics with matching properties.
 */
export class Batcher {
  private metrics = new Map<string, Metric>();

  /**
   * Add a metric to the batcher
   * @param metric The metric to add
   */
  public add(metric: Metric) {
    const key = this.getBatchKey(metric);
    const result = this.metrics.get(key);
    if (result !== undefined) {
      metric = result.union(metric);
    }
    this.metrics.set(key, metric);
  }

  /**
   * Convert batched metrics to a list of api compatible metrics
   */
  public toAPIMetrics(): APIMetric[] {
    return [...this.metrics.values()]
      .map((metric) => metric.toAPIMetrics()) // No flatMap support yet in node 10
      .reduce((prev, curr) => prev.concat(curr), []);
  }

  private getBatchKey(metric: Metric): string {
    return JSON.stringify({
      host: metric.host,
      metricType: metric.metricType,
      name: metric.name,
      tags: [...metric.tags].sort(),
    });
  }
}
