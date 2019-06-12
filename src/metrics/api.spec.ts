import nock from "nock";

import { APIClient } from "./api";
import { APIMetric } from "./model";

const baseAPIURL = "https://www.example.com";

describe("APIClient", () => {
  it("sends metrics", async () => {
    const input: APIMetric[] = [
      {
        metric: "a-metric",
        points: [[1, 2], [3, 4], [5, 6]],
        tags: ["a", "b", "c"],
        type: "distribution",
      },
      {
        metric: "b-metric",
        points: [[1, 2], [3, 4], [5, 6]],
        tags: ["a", "b", "c"],
        type: "distribution",
      },
    ];

    const scope = nock(baseAPIURL)
      .post("/api/v1/distribution_points?api_key=api_key", JSON.stringify({ series: input }))
      .reply(200);
    const client = new APIClient("api_key", baseAPIURL);

    await client.sendMetrics(input);
    expect(scope.isDone()).toBeTruthy();
  });

  it("throws an authentication error on authentication failure", async () => {
    const scope = nock(baseAPIURL)
      .post("/api/v1/distribution_points?api_key=bad_api_key", JSON.stringify({ series: [] }))
      .reply(403);
    const client = new APIClient("bad_api_key", baseAPIURL);
    await expect(client.sendMetrics([])).rejects.toMatchInlineSnapshot(`"Invalid status code 403"`);
    expect(scope.isDone()).toBeTruthy();
  });

  it("throws an error on connection error failure", async () => {
    const scope = nock(baseAPIURL)
      .post("/api/v1/distribution_points?api_key=api_key", JSON.stringify({ series: [] }))
      .replyWithError("Connection closed");
    const client = new APIClient("api_key", baseAPIURL);
    await expect(client.sendMetrics([])).rejects.toMatchInlineSnapshot(
      `"Failed to send metrics: Error: Connection closed"`,
    );
    expect(scope.isDone()).toBeTruthy();
  });
});
