import nock from "nock";

import { isExtensionRunning, EXTENSION_URL } from "./extension";
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
