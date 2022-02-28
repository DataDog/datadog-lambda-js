import { APIMetric, Metric } from "./model";
/**
 * Batcher joins metrics with matching properties.
 */
export declare class Batcher {
    private metrics;
    /**
     * Add a metric to the batcher
     * @param metric The metric to add
     */
    add(metric: Metric): void;
    /**
     * Convert batched metrics to a list of api compatible metrics
     */
    toAPIMetrics(): APIMetric[];
    private getBatchKey;
}
//# sourceMappingURL=batcher.d.ts.map