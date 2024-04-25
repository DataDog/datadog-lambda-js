import nock from "nock";
import { isExtensionRunning, EXTENSION_URL, flushExtension } from "./extension";
import mock from "mock-fs";

describe("isExtensionRunning", () => {
  afterEach(() => {
    mock.restore();
  });
  it("returns true when extension exists and responds", async () => {
    mock({
      "/opt/extensions/datadog-agent": Buffer.from([0]),
    });
    const ran = await isExtensionRunning();
    expect(ran).toBeTruthy();
  });
  it("returns false when extension doesn't exist", async () => {
    mock({});
    const scope = nock(EXTENSION_URL).get("/lambda/hello").replyWithError("Unreachable");
    const ran = await isExtensionRunning();
    expect(scope.isDone()).toBeFalsy();
    expect(ran).toBeFalsy();
  });
});

describe("flushExtension", () => {
  it("calls flush on the extension", async () => {
    const scope = nock(EXTENSION_URL).post("/lambda/flush", JSON.stringify({})).reply(200);
    await flushExtension(true);
    expect(scope.isDone()).toBeTruthy();
  });
  it("catches error when flush doesn't respond", async () => {
    const scope = nock(EXTENSION_URL).post("/lambda/flush", JSON.stringify({})).replyWithError("Unavailable");
    await flushExtension(true);
    expect(scope.isDone()).toBeTruthy();
  });
});
