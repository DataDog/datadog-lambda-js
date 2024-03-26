import { logDebug, logWarning } from "../utils";

export type MetricParameters = {
  value: number;
  name: string;
  tags: string[];
  metricTime?: Date;
};

export const METRICS_QUEUE_LIMIT = 1024;

/**
 * MetricsQueue is a queue for metrics that are enqueued when the MetricsListener is not initialized.
 *
 * When the MetricsListener is initialized, the metrics are sent to the listener for processing.
 * If the queue is full, all metrics are dropped, and new ones are enqueued. This might happen in two
 * scenarios:
 * 1. The MetricsListener is not initialized for a long time.
 * 2. The MetricsListener is initialized, but the amount of enqueued metrics is higher than the limit.
 */
export class MetricsQueue {
  private queue: MetricParameters[] = [];

  /**
   * Enqueues a metric for later processing.
   * If the queue is full, all metrics are dropped. But the new metric is still enqueued.
   *
   * @param metric The metric to be enqueued.
   */
  public push(metric: MetricParameters) {
    logDebug("Metrics Listener was not initialized. Enqueuing metric for later processing.");
    if (this.queue.length >= METRICS_QUEUE_LIMIT) {
      logWarning("Metrics queue is full, dropping all metrics.");
      this.reset();
    }
    this.queue.push(metric);
  }

  public pop() {
    if (this.queue.length > 0) {
      return this.queue.pop();
    }

    return undefined;
  }

  public reverse() {
    this.queue.reverse();
  }

  public reset() {
    this.queue = [];
  }

  public get length() {
    return this.queue.length;
  }
}
