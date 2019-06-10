import http from "http";
import nock from "nock";

import { datadog } from "./index";

<<<<<<< HEAD
=======
// tslint:disable-next-line: no-var-requires
const nock = require("nock");

>>>>>>> master
describe("datadog", () => {
  let traceId: string | undefined;
  let parentId: string | undefined;
  let sampled: string | undefined;

  const handler = (ev: any) => {
    // Mocks out the call

    const req = http.get("http://www.example.com");
    traceId = req.getHeader("x-datadog-trace-id") as string;
    parentId = req.getHeader("x-datadog-parent-id") as string;
    sampled = req.getHeader("x-datadog-sampling-priority") as string;
  };
  beforeEach(() => {
    traceId = undefined;
    parentId = undefined;
    sampled = undefined;
  });
  it("patches http request when autoPatch enabled", () => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
    datadog(handler)(
      {
        headers: {
          "x-datadog-parent-id": "9101112",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "123456",
        },
      },
      {} as any,
      () => {},
    );

    expect(traceId).toEqual("123456");
    expect(parentId).toEqual("9101112");
    expect(sampled).toEqual("2");
  });
  it("doesn't patch http request when autoPatch is disabled", () => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
    datadog(handler, { autoPatchHTTP: false })(
      {
        headers: {
          "x-datadog-parent-id": "9101112",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "123456",
        },
      },
      {} as any,
      () => {},
    );

    expect(traceId).toBeUndefined();
    expect(parentId).toBeUndefined();
    expect(sampled).toBeUndefined();
  });
});
