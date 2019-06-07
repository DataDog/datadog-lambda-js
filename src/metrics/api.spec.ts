import nock from "nock";

import { APIClient } from "./api";
import { APIMetric } from "./model";

const baseAPIURL = "https://www.example.com";

describe("APIClient", () => {
  it("prewarms the connection", async () => {
    let called = false;

    const scope = nock(baseAPIURL)
      .get("/v1/validate?api_key=api_key")
      .reply(200, () => {
        called = true;
        return {};
      });
    const client = new APIClient("api_key", baseAPIURL);
    await client.prewarmConnection();
    expect(called).toBeTruthy();
  });

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
      .post("/v1/series?api_key=api_key", JSON.stringify({ series: input }))
      .reply(200);
    const client = new APIClient("api_key", baseAPIURL);

    await client.sendMetrics(input);
    expect(scope.isDone()).toBeTruthy();
  });

  it("throws an authentication error on authentication failure", async () => {
    const scope = nock(baseAPIURL)
      .post("/v1/series?api_key=bad_api_key", JSON.stringify({ series: [] }))
      .reply(403);
    const client = new APIClient("bad_api_key", baseAPIURL);
    await expect(client.sendMetrics([])).rejects.toMatchInlineSnapshot(`"Invalid status code 403"`);
    expect(scope.isDone()).toBeTruthy();
  });

  it("throws an error on connection error failure", async () => {
    const scope = nock(baseAPIURL)
      .post("/v1/series?api_key=api_key", JSON.stringify({ series: [] }))
      .replyWithError("Connection closed");
    const client = new APIClient("api_key", baseAPIURL);
    await expect(client.sendMetrics([])).rejects.toMatchInlineSnapshot(
      `"Failed to send metrics: Error: Connection closed"`,
    );
    expect(scope.isDone()).toBeTruthy();
  });
});
