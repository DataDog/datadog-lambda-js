import nock from "nock";

import { isAgentRunning, flushExtension, AGENT_URL } from "./extension";

describe("isAgentRunning", () => {
  it("returns true when agent responds", async () => {
    const scope = nock(AGENT_URL).get("/lambda/hello").reply(200);
    const ran = await isAgentRunning();
    expect(scope.isDone()).toBeTruthy();
    expect(ran).toBeTruthy();
  });
  it("returns false when agent doesn't respond", async () => {
    const scope = nock(AGENT_URL).get("/lambda/hello").replyWithError("Unreachable");
    const ran = await isAgentRunning();
    expect(scope.isDone()).toBeTruthy();
    expect(ran).toBeFalsy();
  });
});
describe("flushExtension", () => {
  it("calls flush on the agent", async () => {
    const scope = nock(AGENT_URL).post("/lambda/flush", JSON.stringify({})).reply(200);
    await flushExtension();
    expect(scope.isDone()).toBeTruthy();
  });
  it("catches error when flush doesn't respond", async () => {
    const scope = nock(AGENT_URL).post("/lambda/flush", JSON.stringify({})).replyWithError("Unavailable");
    await flushExtension();
    expect(scope.isDone()).toBeTruthy();
  });
});
