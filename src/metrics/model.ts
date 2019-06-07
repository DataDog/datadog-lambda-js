export type MetricType = "distribution";

export type APIPoint = [number, number];

export interface APIMetric {
  metric: string;
  host?: string;
  tags: string[];
  type: MetricType;
  interval?: number;
  points: APIPoint[];
}

export interface MetricKey {
  metricType: MetricType;
  name: string;
  tags: string[];
  host?: string;
}

export interface Metric extends MetricKey {
  toAPIMetrics(): APIMetric[];
  /**
   * Union creates a new metric that is the union of this metric, and another metric.
   */
  union(metric: Metric): Metric;
}

export interface MetricPoint {
  timestamp: Date;
  value: number;
}

export class Distribution implements Metric {
  public readonly metricType = "distribution";
  public tags: string[];
  public host?: string;

  public constructor(public name: string, public points: MetricPoint[], ...tags: string[]) {
    this.tags = tags;
  }

  public toAPIMetrics(): APIMetric[] {
    const points: APIPoint[] = this.points.map((point) => {
      return [point.timestamp.getTime(), point.value];
    });
    return [
      {
        metric: this.name,
        points,
        tags: this.tags,
        type: this.metricType,
      },
    ];
  }

  public union(metric: Metric): Distribution {
    if (!isDistribution(metric)) {
      return this;
    }

    const distribution = new Distribution(this.name, this.points);
    Object.assign(distribution, { ...this, points: [...this.points, ...metric.points] });
    return distribution;
  }
}

export function isDistribution(metric: Metric): metric is Distribution {
  return metric.metricType === "distribution";
}
