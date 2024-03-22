import { LogLevel, logDebug, setLogLevel, setLogger } from "../utils";
import { METRICS_QUEUE_LIMIT, MetricsQueue } from "./queue";

describe("MetricsQueue", () => {
  const logger = {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };
  describe("push", () => {
    beforeEach(() => {
      setLogLevel(LogLevel.NONE);
      setLogger(logger);
    });
    it("resets metrics queue when its full", () => {
      setLogLevel(LogLevel.WARNING);
      const queue = new MetricsQueue();
      for (let i = 0; i < METRICS_QUEUE_LIMIT + 1; i++) {
        queue.push({ name: "metric", tags: [], value: i });
      }

      // The queue should have been reset and only contain the last metric
      expect(queue.length).toBe(1);
      expect(logger.warn).toHaveBeenLastCalledWith(
        '{"status":"warning","message":"datadog:Metrics queue is full, dropping all metrics."}',
      );
    });

    it("enqueue metric", () => {
      setLogLevel(LogLevel.DEBUG);
      const queue = new MetricsQueue();
      queue.push({ name: "metric", tags: [], value: 1 });
      expect(queue.length).toBe(1);
      expect(logger.debug).toHaveBeenLastCalledWith(
        '{"status":"debug","message":"datadog:Metrics Listener was not initialized. Enqueuing metric for later processing."}',
      );
    });
  });

  describe("shift", () => {
    it("returns undefined when queue is empty", () => {
      const queue = new MetricsQueue();
      expect(queue.shift()).toBeUndefined();
    });

    it("returns the first element in the queue", () => {
      const queue = new MetricsQueue();
      queue.push({ name: "metric", tags: [], value: 1 });
      queue.push({ name: "metric", tags: [], value: 2 });
      expect(queue.shift()).toEqual({ name: "metric", tags: [], value: 1 });
    });
  });

  it("resets the queue", () => {
    const queue = new MetricsQueue();
    queue.push({ name: "metric", tags: [], value: 1 });
    queue.push({ name: "metric", tags: [], value: 2 });
    queue.reset();
    expect(queue.length).toBe(0);
  });

  it("returns the length of the queue", () => {
    const queue = new MetricsQueue();
    queue.push({ name: "metric", tags: [], value: 1 });
    queue.push({ name: "metric", tags: [], value: 2 });
    expect(queue.length).toBe(2);
  });
});
