import { buildMetricLog } from "./metric-log";

describe("buildMetricLog", () => {
  jest.spyOn(Date, "now").mockImplementation(() => 1487076708123);
  it("handles empty tag list", () => {
    expect(buildMetricLog("my.test.metric", 1337, [])).toStrictEqual(
      '{"e":1487076708.123,"m":"my.test.metric","t":[],"v":1337}\n',
    );
  });
  it("writes timestamp in Unix seconds", () => {
    expect(buildMetricLog("my.test.metric", 1337, ["region:us", "account:dev", "team:serverless"])).toStrictEqual(
      '{"e":1487076708.123,"m":"my.test.metric","t":["region:us","account:dev","team:serverless"],"v":1337}\n',
    );
  });
});
