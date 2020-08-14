import nock from "nock";

import { isAgentRunning, flushAgent, AGENT_URL } from "./extension";

describe("isAgentRunning", () => {
  it("returns true when agent responds", async () => {
    const scope = nock(AGENT_URL)
      .post("/lambda/hello", JSON.stringify({}))
      .reply(200);
    const ran = await isAgentRunning();
    expect(scope.isDone()).toBeTruthy();
    expect(ran).toBeTruthy();
  });
  it("returns false when agent doesn't respond", async () => {
    const scope = nock("http://localhost:8124")
      .post("/lambda/hello", JSON.stringify({}))
      .replyWithError("Unreachable");
    const ran = await isAgentRunning();
    expect(scope.isDone()).toBeTruthy();
    expect(ran).toBeFalsy();
  });
});
describe("flushAgent", () => {
  it("calls flush on the agent", async () => {
    const scope = nock("http://localhost:8124")
      .post("/lambda/flush", JSON.stringify({}))
      .reply(200);
    await flushAgent();
    expect(scope.isDone()).toBeTruthy();
  });
  it("catches error when flush doesn't respond", async () => {
    const scope = nock("http://localhost:8124")
      .post("/lambda/flush", JSON.stringify({}))
      .replyWithError("Unavailable");
    await flushAgent();
    expect(scope.isDone()).toBeTruthy();
  });
});
