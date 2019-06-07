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
