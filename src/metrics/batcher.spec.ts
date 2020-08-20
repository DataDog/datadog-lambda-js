import { Batcher } from "./batcher";
import { Distribution } from "./model";

describe("Batcher", () => {
  it("joins metrics with different tag orders", () => {
    const batcher = new Batcher();
    const timestamp = new Date(1559928315000);
    const distribution1 = new Distribution(
      "my-dist",
      [
        { timestamp, value: 1 },
        { timestamp, value: 2 },
      ],
      "tag:a",
      "tag:b",
      "tag:c",
    );
    const distribution2 = new Distribution("my-dist", [{ timestamp, value: 3 }], "tag:c", "tag:b", "tag:a");

    batcher.add(distribution1);
    batcher.add(distribution2);
    const metrics = batcher.toAPIMetrics();
    expect(metrics).toEqual([
      {
        metric: "my-dist",
        points: [
          [1559928315, [1]],
          [1559928315, [2]],
          [1559928315, [3]],
        ],
        tags: ["tag:a", "tag:b", "tag:c"],
        type: "distribution",
      },
    ]);
  });

  it("doesn't join metrics with different tags", () => {
    const batcher = new Batcher();
    const timestamp = new Date(1559928315000);
    const distribution1 = new Distribution(
      "my-dist",
      [
        { timestamp, value: 1 },
        { timestamp, value: 2 },
      ],
      "tag:a",
      "tag:b",
      "tag:c",
    );
    const distribution2 = new Distribution("my-dist", [{ timestamp, value: 3 }], "tag:b", "tag:a");

    batcher.add(distribution1);
    batcher.add(distribution2);
    const metrics = batcher.toAPIMetrics();
    expect(metrics).toEqual([
      {
        metric: "my-dist",
        points: [
          [1559928315, [1]],
          [1559928315, [2]],
        ],
        tags: ["tag:a", "tag:b", "tag:c"],
        type: "distribution",
      },
      {
        metric: "my-dist",
        points: [[1559928315, [3]]],
        tags: ["tag:b", "tag:a"],
        type: "distribution",
      },
    ]);
  });
});
