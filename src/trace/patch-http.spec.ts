import http from "http";
import https, { RequestOptions } from "https";
import nock from "nock";
import { parse } from "url";

import { setErrorLoggingEnabled } from "../utils";
import { parentIDHeader, SampleMode, samplingPriorityHeader, traceIDHeader } from "./constants";
import { patchHttp, unpatchHttp } from "./patch-http";
import { TraceContextService } from "./trace-context-service";

describe("patchHttp", () => {
  let contextService: TraceContextService;

  function expectHeaders(request: http.ClientRequest) {
    const headers = request.getHeaders();
    expect(headers[traceIDHeader]).toEqual("123456");
    expect(headers[parentIDHeader]).toEqual("78910");
    expect(headers[samplingPriorityHeader]).toEqual("2");
  }

  beforeEach(() => {
    contextService = new TraceContextService();
    contextService.rootTraceContext = {
      parentID: "78910",
      sampleMode: SampleMode.USER_KEEP,
      traceID: "123456",
    };
    setErrorLoggingEnabled(false);
  });

  afterEach(() => {
    unpatchHttp();
  });

  it("injects tracing headers into requests", () => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});

    patchHttp(contextService);
    const req = http.request("http://www.example.com");
    expectHeaders(req);
  });
  it("injects tracing headers into get requests", () => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
    patchHttp(contextService);
    const req = http.get("http://www.example.com");
    expectHeaders(req);
  });
  it("injects tracing headers into https requests", () => {
    nock("https://www.example.com")
      .get("/")
      .reply(200, {});
    patchHttp(contextService);
    const req = https.request("https://www.example.com");
    expectHeaders(req);
  });
  it("injects tracing headers into https get requests", () => {
    nock("https://www.example.com")
      .get("/")
      .reply(200, {});
    patchHttp(contextService);
    const req = https.get("https://www.example.com");
    expectHeaders(req);
  });

  it("injects tracing headers when using request options", () => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
    patchHttp(contextService);
    const opt: RequestOptions = {
      headers: { "some-header": "some-value" },
      host: "www.example.com",
      protocol: "http",
    };
    const req = http.request(opt);
    const headers = req.getHeaders();
    expectHeaders(req);
    expect(headers["some-header"]).toEqual("some-value");
  });
  it("injects tracing headers when using request options and path", () => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
    patchHttp(contextService);
    const opt: RequestOptions = {
      headers: { "some-header": "some-value" },
    };
    const req = http.request("http://www.example.com", opt);
    const headers = req.getHeaders();
    expectHeaders(req);
    expect(headers["some-header"]).toEqual("some-value");
  });
  it("injects tracing headers when using URL", () => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
    patchHttp(contextService);
    const url = parse("http://www.example.com");
    const req = http.request(url);
    expectHeaders(req);
  });
  it("passes callback through to request", (done) => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
    patchHttp(contextService);
    const req = http.request("http://www.example.com", () => {
      done();
    });
    req.end();
    expectHeaders(req);
  });
  it("passes callback through to request with request options", (done) => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});
    patchHttp(contextService);
    const options = {
      headers: { "some-header": "a-value" },
    };
    const req = http.request("http://www.example.com", options, () => {
      done();
    });
    req.end();
    const headers = req.getHeaders();
    expectHeaders(req);
    expect(headers["some-header"]).toEqual("a-value");
  });
  it("doesn't inject tracing headers when context is empty", () => {
    nock("http://www.example.com")
      .get("/")
      .reply(200, {});

    contextService.rootTraceContext = undefined;
    patchHttp(contextService);
    const req = http.request("http://www.example.com");
    const headers = req.getHeaders();
    expect(headers[traceIDHeader]).toBeUndefined();
    expect(headers[parentIDHeader]).toBeUndefined();
    expect(headers[samplingPriorityHeader]).toBeUndefined();
  });
});
