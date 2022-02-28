import { Client } from "./api";
import { Metric } from "./model";
/**
 * Processor batches metrics, and sends them to the API periodically.
 */
export declare class Processor {
    private client;
    private shouldRetryOnFail;
    private retryInterval;
    private timer;
    private batcher;
    private loopPromise?;
    /**
     * Create a new Processor.
     * @param client The api client to use to send to metrics to Datadog.
     * @param intervalMS The interval in milliseconds, after which to send a batch of metrics.
     * @param shouldRetryOnFail Whether the processor to retry to send any metrics that weren't successfully flushed.
     * @param retryInterval The amount of time before retrying the final flush.
     */
    constructor(client: Client, intervalMS: number, shouldRetryOnFail: boolean, retryInterval?: number);
    /**
     * Start processing incoming metrics asynchronously.
     */
    startProcessing(): void;
    /**
     * Add a new metric to be batched and sent.
     */
    addMetric(metric: Metric): void;
    /**
     * Send any unprocessed metrics. Resolves on completion.
     */
    flush(): Promise<void>;
    private sendMetricsLoop;
}
//# sourceMappingURL=processor.d.ts.map