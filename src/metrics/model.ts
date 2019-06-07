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

export interface Metric {
  metricType: MetricType;
  name: string;
  tags: string[];

  addPoint(timestamp: Date, value: number): void;
  toAPIMetrics(): APIMetric[];
  join(metric: Metric): void;
}

export class Distribution implements Metric {
  public metricType: MetricType = "distribution";
  public tags: string[];

  public points: Array<{ timestamp: Date; value: number }> = [];

  public constructor(public name: string, ...tags: string[]) {
    this.tags = tags;
  }

  public addPoint(timestamp: Date, value: number) {
    this.points.push({ timestamp, value });
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

  public join(metric: Metric) {
    if (!isDistribution(metric)) {
      return;
    }
    this.points.push(...metric.points);
  }
}

export function isDistribution(metric: Metric): metric is Distribution {
  return metric.metricType === "distribution";
}
