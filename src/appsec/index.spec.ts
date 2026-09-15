const mockPublish = jest.fn();

jest.mock("dc-polyfill", () => ({
  channel: jest.fn(() => ({
    publish: mockPublish,
    hasSubscribers: true,
  })),
}));

import { processAppsecRequest, processAppsecResponse } from "./index";

jest.mock("./event-data-extractor", () => ({
  extractHTTPDataFromEvent: jest.fn(),
}));

import { extractHTTPDataFromEvent } from "./event-data-extractor";

const mockExtract = extractHTTPDataFromEvent as jest.MockedFunction<typeof extractHTTPDataFromEvent>;

const inferringEvent = {
  version: "2.0",
  rawQueryString: "",
  requestContext: { domainName: "abc.execute-api.eu-west-1.amazonaws.com" },
};
const nonInferringEvent = { requestContext: { stage: "dev" }, httpMethod: "GET", resource: "/" };

// The trigger and the streaming flag are what processAppsecResponse derives the mode from, so each
// test declares them instead of building the payload.
const publishResponse = (
  span: any,
  result: any,
  statusCode: string | undefined,
  mode: "infer" | "noinfer" | "stream",
) =>
  processAppsecResponse({
    span,
    event: mode === "noinfer" ? nonInferringEvent : inferringEvent,
    result,
    statusCode,
    responseStream: mode === "stream",
  });

describe("AppSec orchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("processAppSecRequest", () => {
    it("should not publish when span is falsy", () => {
      processAppsecRequest({}, null);
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it("should not publish when event is not an HTTP trigger", () => {
      mockExtract.mockReturnValue(undefined as any);
      const span = { setTag: jest.fn() };

      processAppsecRequest({}, span);

      expect(mockPublish).not.toHaveBeenCalled();
      expect(span.setTag).toHaveBeenCalledWith("_dd.appsec.unsupported_event_type", 1);
    });

    it("should publish extracted HTTP data to the start-invocation channel", () => {
      const span = { setTag: jest.fn() };
      const httpData = {
        headers: { host: "example.com" },
        method: "POST",
        path: "/api/test",
        query: { foo: "bar" },
        body: { key: "value" },
        isBase64Encoded: false,
        clientIp: "1.2.3.4",
        pathParams: { id: "123" },
        cookies: { session: "abc" },
        route: "/api/{id}",
      };
      mockExtract.mockReturnValue(httpData);

      processAppsecRequest({}, span);

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        headers: httpData.headers,
        method: httpData.method,
        path: httpData.path,
        query: httpData.query,
        body: httpData.body,
        isBase64Encoded: httpData.isBase64Encoded,
        clientIp: httpData.clientIp,
        pathParams: httpData.pathParams,
        cookies: httpData.cookies,
        route: httpData.route,
      });
    });
  });

  describe("processAppSecResponse", () => {
    it("should not publish when span is falsy", () => {
      publishResponse(null, { statusCode: 200 }, "200", "infer");
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it("should publish the normalized status code and the response headers", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { statusCode: 200, headers: { "content-type": "application/json" } }, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should publish with undefined statusCode and headers when result has none", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, {}, undefined, "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: undefined,
        responseHeaders: { "content-type": "application/json" },
        responseBody: {},
        isBase64Encoded: false,
      });
    });

    it("should ignore the status code carried by the result", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { statusCode: 200 }, "502", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "502",
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should publish the normalized status code when the result carries none", () => {
      const span = { setTag: jest.fn() };

      const result = { headers: { "content-type": "application/json" } };

      publishResponse(span, result, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
        responseBody: result,
        isBase64Encoded: false,
      });
    });

    it("should lowercase the response header names", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { statusCode: 200, headers: { "X-Option": "test_value" } }, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "x-option": "test_value" },
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should merge multi value response headers", () => {
      const span = { setTag: jest.fn() };

      publishResponse(
        span,
        {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          multiValueHeaders: { "X-Option": ["a", "b"] },
        },
        "200",
        "infer",
      );

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json", "x-option": "a, b" },
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should ignore multi value response headers that are not arrays", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { statusCode: 200, multiValueHeaders: { "Set-Cookie": "a=b" } }, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: {},
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should stringify non string response header values", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { statusCode: 200, headers: { "Content-Length": 42, "X-Flag": true } }, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-length": "42", "x-flag": "true" },
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should skip response headers with a null value", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { statusCode: 200, headers: { "X-Option": null } }, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: {},
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should publish no status code when none is normalized, even if the result carries one", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { statusCode: 204 }, undefined, "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: undefined,
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should publish the body of a proxy integration response", () => {
      const span = { setTag: jest.fn() };
      const body = JSON.stringify({ payload: { key: "value" } });

      publishResponse(span, { statusCode: 200, headers: { "Content-Type": "application/json" }, body }, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
        responseBody: body,
        isBase64Encoded: false,
      });
    });

    it("should publish no headers when a structured response carries none", () => {
      const span = { setTag: jest.fn() };
      const body = JSON.stringify({ payload: 1 });

      publishResponse(span, { statusCode: 200, body }, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: undefined,
        responseBody: body,
        isBase64Encoded: false,
      });
    });

    it("should publish the body raw, without parsing or decoding it", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { statusCode: 200, body: "eyJhIjoiYiJ9", isBase64Encoded: true }, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: undefined,
        responseBody: "eyJhIjoiYiJ9",
        isBase64Encoded: true,
      });
    });

    it("should publish the whole result as the body when it is not a proxy integration response", () => {
      const span = { setTag: jest.fn() };
      const result = { message: "ok", items: [1, 2] };

      publishResponse(span, result, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
        responseBody: result,
        isBase64Encoded: false,
      });
    });

    it("should preserve an inferred payload that carries a body key", () => {
      const span = { setTag: jest.fn() };
      const result = { body: { value: 1 } };

      publishResponse(span, result, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
        responseBody: result,
        isBase64Encoded: false,
      });
    });

    it("should not read the headers of an inferred payload as response headers", () => {
      const span = { setTag: jest.fn() };
      const result = { headers: { "content-type": "text/plain" }, payload: 1 };

      publishResponse(span, result, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
        responseBody: result,
        isBase64Encoded: false,
      });
    });

    it("should not read the multi value headers of an inferred payload as response headers", () => {
      const span = { setTag: jest.fn() };
      const result = { multiValueHeaders: { count: [2] } };

      publishResponse(span, result, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
        responseBody: result,
        isBase64Encoded: false,
      });
    });

    it("should not read the base64 flag of an inferred payload", () => {
      const span = { setTag: jest.fn() };
      const result = { isBase64Encoded: true, payload: 1 };

      publishResponse(span, result, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
        responseBody: result,
        isBase64Encoded: false,
      });
    });

    it("should treat a result whose status code does not survive serialization as an inferred payload", () => {
      const span = { setTag: jest.fn() };
      const result = { statusCode: undefined, body: { value: 1 } };

      publishResponse(span, result, "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
        responseBody: result,
        isBase64Encoded: false,
      });
    });

    it("should publish neither body nor headers when the trigger does not infer responses", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { payload: 1 }, "200", "noinfer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should still publish the headers of a structured response when the trigger does not infer", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { statusCode: 200, headers: { "X-Option": "a" } }, "200", "noinfer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "x-option": "a" },
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should publish no response data for a streaming function that returned nothing", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, undefined, "200", "stream");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should publish no response data for a streaming function that returned a payload", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { payload: 1 }, "200", "stream");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should publish no response data for a streaming function that returned a structured response", () => {
      const span = { setTag: jest.fn() };

      publishResponse(
        span,
        { statusCode: 201, headers: { "Content-Type": "text/plain" }, body: "streamed", isBase64Encoded: true },
        "201",
        "stream",
      );

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "201",
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should publish a non object result as the body", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, "plain text", "200", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
        responseBody: "plain text",
        isBase64Encoded: false,
      });
    });

    it("should publish no body when the handler returned nothing", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, undefined, "502", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "502",
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    describe("which triggers serve a result without a status code as the body", () => {
      const inferred = (span: any) => ({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
        responseBody: { payload: 1 },
        isBase64Encoded: false,
      });
      const nothing = (span: any) => ({
        span,
        statusCode: "200",
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });

      it.each([
        [
          "an HTTP API payload format 2.0 trigger",
          {
            version: "2.0",
            rawQueryString: "",
            requestContext: { domainName: "abc.execute-api.eu-west-1.amazonaws.com" },
          },
          true,
        ],
        [
          "a function url trigger",
          { version: "2.0", rawQueryString: "", requestContext: { domainName: "abc.lambda-url.eu-west-1.on.aws" } },
          true,
        ],
        [
          "a REST API payload format 1.0 trigger",
          { requestContext: { stage: "dev" }, httpMethod: "GET", resource: "/" },
          false,
        ],
        ["an ALB trigger", { requestContext: { elb: { targetGroupArn: "arn" } }, httpMethod: "GET", path: "/" }, false],
        ["a non HTTP trigger", { Records: [] }, false],
        ["a missing event", undefined, false],
        ["a non object event", "string event", false],
      ])("should decide inference from the trigger: %s", (_label, event, infers) => {
        const span = { setTag: jest.fn() };

        processAppsecResponse({ span, event, result: { payload: 1 }, statusCode: "200", responseStream: false });

        expect(mockPublish).toHaveBeenCalledWith(infers ? inferred(span) : nothing(span));
      });
    });

    it("should stop inferring when the handler strips the event identity fields", () => {
      const span = { setTag: jest.fn() };
      const mutated: any = { ...inferringEvent };
      delete mutated.version;
      delete mutated.requestContext;

      // Accepted trade: the mode is resolved where it is consumed, so a handler that rewrites the
      // event's identity fields loses inference. Resolving it earlier meant shared mutable state.
      processAppsecResponse({
        span,
        event: mutated,
        result: { payload: 1 },
        statusCode: "200",
        responseStream: false,
      });

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    describe("when the envelope carries an unservable status code", () => {
      const nothing = (span: any) => ({
        span,
        statusCode: "200",
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });

      it.each([
        ["null", null],
        ["zero", 0],
        ["not a number", NaN],
        ["at six hundred", 600],
        ["below the range", 99],
        ["a non numeric string", "abc"],
        ["a padded string", " 200 "],
        ["an object", {}],
        ["a boolean", true],
        ["an array", [200]],
        ["a fractional number", 200.5],
      ])("should publish no response data when the status code is %s", (_label, statusCode) => {
        const span = { setTag: jest.fn() };

        publishResponse(span, { statusCode, body: '{"orderId":123}' }, "200", "infer");

        expect(mockPublish).toHaveBeenCalledWith(nothing(span));
      });

      it("should publish nothing rather than infer a body when the trigger does not infer", () => {
        const span = { setTag: jest.fn() };

        publishResponse(span, { statusCode: null, body: '{"orderId":123}' }, "200", "noinfer");

        expect(mockPublish).toHaveBeenCalledWith(nothing(span));
      });

      it("should publish nothing rather than infer the whole envelope as the body", () => {
        const span = { setTag: jest.fn() };

        publishResponse(span, { statusCode: null, payload: 1 }, "200", "infer");

        expect(mockPublish).toHaveBeenCalledWith(nothing(span));
      });

      it.each([
        ["a string status code", "201", "201"],
        ["the lowest servable status code", 100, "100"],
        ["the highest servable status code", 599, "599"],
      ])("should publish the envelope for %s", (_label, statusCode, published) => {
        const span = { setTag: jest.fn() };

        publishResponse(span, { statusCode, body: '{"orderId":123}' }, published as string, "infer");

        expect(mockPublish).toHaveBeenCalledWith({
          span,
          statusCode: published,
          responseHeaders: undefined,
          responseBody: '{"orderId":123}',
          isBase64Encoded: false,
        });
      });
    });

    describe("when reading the result throws", () => {
      const throwing = () => {
        throw new Error("instrumentation read");
      };
      const degraded = (span: any, statusCode: string) => ({
        span,
        statusCode,
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });

      it("should survive a throwing status code getter", () => {
        const span = { setTag: jest.fn() };
        const result = {};
        Object.defineProperty(result, "statusCode", { get: throwing, enumerable: true });

        expect(() => publishResponse(span, result, "200", "infer")).not.toThrow();
        expect(mockPublish).toHaveBeenCalledWith(degraded(span, "200"));
      });

      it("should survive a throwing body getter", () => {
        const span = { setTag: jest.fn() };
        const result = { statusCode: 200 };
        Object.defineProperty(result, "body", { get: throwing, enumerable: true });

        expect(() => publishResponse(span, result, "200", "infer")).not.toThrow();
        expect(mockPublish).toHaveBeenCalledWith(degraded(span, "200"));
      });

      it("should survive a throwing base64 flag getter", () => {
        const span = { setTag: jest.fn() };
        const result = { statusCode: 200, body: "ok" };
        Object.defineProperty(result, "isBase64Encoded", { get: throwing, enumerable: true });

        expect(() => publishResponse(span, result, "200", "infer")).not.toThrow();
        expect(mockPublish).toHaveBeenCalledWith(degraded(span, "200"));
      });

      it("should survive a throwing headers getter", () => {
        const span = { setTag: jest.fn() };
        const result = { statusCode: 200, body: "ok" };
        Object.defineProperty(result, "headers", { get: throwing, enumerable: true });

        expect(() => publishResponse(span, result, "200", "infer")).not.toThrow();
        expect(mockPublish).toHaveBeenCalledWith(degraded(span, "200"));
      });

      it("should survive a throwing multi value headers getter", () => {
        const span = { setTag: jest.fn() };
        const result = { statusCode: 200, body: "ok" };
        Object.defineProperty(result, "multiValueHeaders", { get: throwing, enumerable: true });

        expect(() => publishResponse(span, result, "200", "infer")).not.toThrow();
        expect(mockPublish).toHaveBeenCalledWith(degraded(span, "200"));
      });

      it("should survive a throwing getter on a header name", () => {
        const span = { setTag: jest.fn() };
        const headers = {};
        Object.defineProperty(headers, "X-Option", { get: throwing, enumerable: true });

        expect(() => publishResponse(span, { statusCode: 200, headers }, "200", "infer")).not.toThrow();
        expect(mockPublish).toHaveBeenCalledWith(degraded(span, "200"));
      });

      it("should survive a throwing toString on a header value", () => {
        const span = { setTag: jest.fn() };
        const headers = { "X-Option": { toString: throwing } };

        expect(() => publishResponse(span, { statusCode: 200, headers }, "200", "infer")).not.toThrow();
        expect(mockPublish).toHaveBeenCalledWith(degraded(span, "200"));
      });

      it("should survive a throwing join on a multi value header", () => {
        const span = { setTag: jest.fn() };
        const values = ["a", "b"];
        values.join = throwing;

        expect(() =>
          publishResponse(span, { statusCode: 200, multiValueHeaders: { "X-Option": values } }, "200", "infer"),
        ).not.toThrow();
        expect(mockPublish).toHaveBeenCalledWith(degraded(span, "200"));
      });
    });

    it("should publish no body when a proxy integration response carries none", () => {
      const span = { setTag: jest.fn() };

      publishResponse(span, { statusCode: 204, body: null }, "204", "infer");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "204",
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });
  });
});
