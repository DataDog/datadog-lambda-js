export declare type MetricType = "distribution";
export declare type APIPoint = [number, number[]];
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
export declare class Distribution implements Metric {
    name: string;
    points: MetricPoint[];
    readonly metricType = "distribution";
    tags: string[];
    host?: string;
    constructor(name: string, points: MetricPoint[], ...tags: string[]);
    toAPIMetrics(): APIMetric[];
    union(metric: Metric): Distribution;
}
export declare function isDistribution(metric: Metric): metric is Distribution;
//# sourceMappingURL=model.d.ts.map