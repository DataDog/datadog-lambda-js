import { promisify } from "util";

import { Client } from "./api";
import { APIMetric, Distribution, Metric } from "./model";
import { Processor } from "./processor";

jest.useFakeTimers("legacy");

class MockAPIClient implements Client {
  public metricCalls: APIMetric[][] = [];
  public throwError = false;
  public called = 0;

  public async sendMetrics(metrics: APIMetric[]): Promise<void> {
    this.called++;
    if (this.throwError) {
      throw Error("");
    }
    this.metricCalls.push(metrics);
    return;
  }
}

function makeMetric(name: string = "my-metric", value: number = 1): Metric {
  const timestamp = new Date(1559941498000);
  return new Distribution(name, [{ timestamp, value }], "tag:a", "tag:b");
}

function advanceTime(time: number) {
  jest.advanceTimersByTime(time + 1);
  // yield the event loop for 1 frame, so processor can run.
  return promisify(process.nextTick)();
}

describe("Processor", () => {
  it("batches and sends metrics on a regular interval", async () => {
    const client = new MockAPIClient();
    const intervalMS = 10;

    const processor = new Processor(client, intervalMS, true);
    processor.startProcessing();
    processor.addMetric(makeMetric("my-metric", 1));
    processor.addMetric(makeMetric("my-metric", 2));

    // Let the processor send a batch
    await advanceTime(intervalMS);

    processor.addMetric(makeMetric("my-metric", 3));

    await advanceTime(intervalMS);

    expect(client.metricCalls).toEqual([
      [
        {
          metric: "my-metric",
          points: [
            [1559941498, [1]],
            [1559941498, [2]],
          ],
          tags: ["tag:a", "tag:b"],
          type: "distribution",
        },
      ],
      [
        {
          metric: "my-metric",
          points: [[1559941498, [3]]],
          tags: ["tag:a", "tag:b"],
          type: "distribution",
        },
      ],
    ]);
  });

  it("sends pending metrics on flush", async () => {
    const client = new MockAPIClient();
    const intervalMS = 10;

    const processor = new Processor(client, intervalMS, false);
    processor.startProcessing();
    processor.addMetric(makeMetric("my-metric", 1));
    processor.addMetric(makeMetric("my-metric", 2));
    await processor.flush();

    expect(client.metricCalls).toEqual([
      [
        {
          metric: "my-metric",
          points: [
            [1559941498, [1]],
            [1559941498, [2]],
          ],
          tags: ["tag:a", "tag:b"],
          type: "distribution",
        },
      ],
    ]);
  });

  it("sends metrics on flush, even if it hasn't been started", async () => {
    const client = new MockAPIClient();
    const intervalMS = 10;

    const processor = new Processor(client, intervalMS, false);
    processor.addMetric(makeMetric("my-metric", 1));
    processor.addMetric(makeMetric("my-metric", 2));
    await processor.flush();

    expect(client.metricCalls).toEqual([
      [
        {
          metric: "my-metric",
          points: [
            [1559941498, [1]],
            [1559941498, [2]],
          ],
          tags: ["tag:a", "tag:b"],
          type: "distribution",
        },
      ],
    ]);
  });

  it("adds metrics to next batch if api send failed", async () => {
    const client = new MockAPIClient();
    const intervalMS = 10;

    const processor = new Processor(client, intervalMS, true);
    processor.startProcessing();
    processor.addMetric(makeMetric("my-metric", 1));
    processor.addMetric(makeMetric("my-metric", 2));
    client.throwError = true;

    await advanceTime(intervalMS);

    processor.addMetric(makeMetric("my-metric", 3));
    client.throwError = false;

    await advanceTime(intervalMS);

    expect(client.metricCalls).toEqual([
      [
        {
          metric: "my-metric",
          points: [
            [1559941498, [1]],
            [1559941498, [2]],
            [1559941498, [3]],
          ],
          tags: ["tag:a", "tag:b"],
          type: "distribution",
        },
      ],
    ]);
  });

  it("retries to send metrics on flush", async () => {
    const client = new MockAPIClient();
    client.throwError = true;
    const intervalMS = 10;
    const retryIntervalMS = 10;

    const processor = new Processor(client, intervalMS, true, retryIntervalMS);
    processor.startProcessing();
    processor.addMetric(makeMetric("my-metric", 1));
    processor.addMetric(makeMetric("my-metric", 2));

    const promise = processor.flush();
    // Retry logic uses timers internally, so we have to let the event loop run, and yield
    // control.
    await advanceTime(0);
    await advanceTime(retryIntervalMS);
    await advanceTime(retryIntervalMS);

    await expect(promise).rejects.toMatchInlineSnapshot(`[Error: Failed to send metrics to Datadog]`);

    expect(client.called).toEqual(3);
  });
});
