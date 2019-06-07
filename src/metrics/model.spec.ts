import { Distribution } from "./model";

describe("Distribution", () => {
  it("converts to a APIMetric", () => {
    const distribution = new Distribution("my-dist", "tag:a", "tag:b", "tag:c");
    const timestamp = new Date(1559928315);
    distribution.addPoint(timestamp, 1);
    distribution.addPoint(timestamp, 2);
    distribution.addPoint(timestamp, 3);

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
    const distribution1 = new Distribution("my-dist", "tag:a", "tag:b", "tag:c");
    const distribution2 = new Distribution("my-dist", "tag:a", "tag:b", "tag:c");
    const timestamp = new Date(1559928315);
    distribution1.addPoint(timestamp, 1);
    distribution1.addPoint(timestamp, 2);
    distribution2.addPoint(timestamp, 3);
    distribution1.join(distribution2);

    expect(distribution1.points).toEqual([{ timestamp, value: 1 }, { timestamp, value: 2 }, { timestamp, value: 3 }]);
  });
});
