import promiseRetry from "promise-retry";

import { Timer } from "../utils";
import { Client } from "./api";
import { Batcher } from "./batcher";
import { Metric } from "./model";

const defaultRetryIntervalMS = 250;

/**
 * Processor batches metrics, and sends them to the API periodically.
 */
export class Processor {
  private timer: Timer;
  private batcher = new Batcher();
  private loopPromise?: Promise<void>;

  /**
   * Create a new Processor.
   * @param client The api client to use to send to metrics to Datadog.
   * @param intervalMS The interval in milliseconds, after which to send a batch of metrics.
   * @param shouldRetryOnFail Whether the processor to retry to send any metrics that weren't successfully flushed.
   * @param retryInterval The amount of time before retrying the final flush.
   */
  constructor(
    private client: Client,
    intervalMS: number,
    private shouldRetryOnFail: boolean,
    private retryInterval = defaultRetryIntervalMS,
  ) {
    this.timer = new Timer(intervalMS);
  }

  /**
   * Start processing incoming metrics asynchronously.
   */
  public startProcessing() {
    if (this.loopPromise !== undefined) {
      return;
    }
    this.timer.start();
    this.loopPromise = this.sendMetricsLoop();
  }

  /**
   * Add a new metric to be batched and sent.
   */
  public addMetric(metric: Metric) {
    this.batcher.add(metric);
  }

  /**
   * Send any unprocessed metrics. Resolves on completion.
   */
  public async flush() {
    this.timer.complete();

    if (this.loopPromise === undefined) {
      this.loopPromise = this.sendMetricsLoop();
    }

    await this.loopPromise;
  }

  private async sendMetricsLoop() {
    while (!(await this.timer.nextTimeout())) {
      const oldBatcher = this.batcher;
      this.batcher = new Batcher();

      const metrics = oldBatcher.toAPIMetrics();
      if (metrics.length === 0) {
        continue;
      }

      try {
        await this.client.sendMetrics(metrics);
      } catch {
        // Failed to send metrics, keep the old batch alive if retrying is enabled
        if (this.shouldRetryOnFail) {
          this.batcher = oldBatcher;
        }
      }
    }
    const finalMetrics = this.batcher.toAPIMetrics();
    if (finalMetrics.length === 0) {
      return;
    }
    try {
      const options = {
        maxTimeout: this.retryInterval,
        minTimeout: this.retryInterval,
        retries: this.shouldRetryOnFail ? 2 : 0,
      };
      await promiseRetry(options, (retry) => this.client.sendMetrics(finalMetrics).catch(retry));
    } catch {
      throw Error("Failed to send metrics to Datadog");
    }
  }
}
