import { Distribution } from "./model";

describe("Distribution", () => {
  it("converts to a APIMetric", () => {
    const timestamp = new Date(1559928315);

    const distribution = new Distribution(
      "my-dist",
      [{ timestamp, value: 1 }, { timestamp, value: 2 }, { timestamp, value: 3 }],
      "tag:a",
      "tag:b",
      "tag:c",
    );

    const result = distribution.toAPIMetrics();
    expect(result).toEqual([
      {
        metric: "my-dist",
        points: [[1559928315, 1], [1559928315, 2], [1559928315, 3]],
        tags: ["tag:a", "tag:b", "tag:c"],
        type: "distribution",
      },
    ]);
  });
  it("joins two distribution metrics", () => {
    const timestamp = new Date(1559928315);

    const distribution1 = new Distribution(
      "my-dist",
      [{ timestamp, value: 1 }, { timestamp, value: 2 }],
      "tag:a",
      "tag:b",
      "tag:c",
    );
    const distribution2 = new Distribution("my-dist", [{ timestamp, value: 3 }], "tag:a", "tag:b", "tag:c");
    const distribution3 = distribution1.union(distribution2);

    expect(distribution3.points).toEqual([{ timestamp, value: 1 }, { timestamp, value: 2 }, { timestamp, value: 3 }]);
  });
});
