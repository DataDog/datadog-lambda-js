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
      processAppsecResponse(null, { statusCode: 200 }, "200", { kind: "buffered", supportsInference: true });
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it("should publish the normalized status code and the response headers", () => {
      const span = { setTag: jest.fn() };

      processAppsecResponse(span, { statusCode: 200, headers: { "content-type": "application/json" } }, "200", {
        kind: "buffered",
        supportsInference: true,
      });

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

      processAppsecResponse(span, {}, undefined, { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, { statusCode: 200 }, "502", { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, result, "200", { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, { statusCode: 200, headers: { "X-Option": "test_value" } }, "200", {
        kind: "buffered",
        supportsInference: true,
      });

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

      processAppsecResponse(
        span,
        {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          multiValueHeaders: { "X-Option": ["a", "b"] },
        },
        "200",
        { kind: "buffered", supportsInference: true },
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

      processAppsecResponse(span, { statusCode: 200, multiValueHeaders: { "Set-Cookie": "a=b" } }, "200", {
        kind: "buffered",
        supportsInference: true,
      });

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

      processAppsecResponse(span, { statusCode: 200, headers: { "Content-Length": 42, "X-Flag": true } }, "200", {
        kind: "buffered",
        supportsInference: true,
      });

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

      processAppsecResponse(span, { statusCode: 200, headers: { "X-Option": null } }, "200", {
        kind: "buffered",
        supportsInference: true,
      });

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

      processAppsecResponse(span, { statusCode: 204 }, undefined, { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, { statusCode: 200, headers: { "Content-Type": "application/json" }, body }, "200", {
        kind: "buffered",
        supportsInference: true,
      });

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

      processAppsecResponse(span, { statusCode: 200, body }, "200", { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, { statusCode: 200, body: "eyJhIjoiYiJ9", isBase64Encoded: true }, "200", {
        kind: "buffered",
        supportsInference: true,
      });

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

      processAppsecResponse(span, result, "200", { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, result, "200", { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, result, "200", { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, result, "200", { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, result, "200", { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, result, "200", { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, { payload: 1 }, "200", { kind: "buffered", supportsInference: false });

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

      processAppsecResponse(span, { statusCode: 200, headers: { "X-Option": "a" } }, "200", {
        kind: "buffered",
        supportsInference: false,
      });

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

      processAppsecResponse(span, undefined, "200", { kind: "streaming" });

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

      processAppsecResponse(span, { payload: 1 }, "200", { kind: "streaming" });

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

      processAppsecResponse(
        span,
        { statusCode: 201, headers: { "Content-Type": "text/plain" }, body: "streamed", isBase64Encoded: true },
        "201",
        { kind: "streaming" },
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

      processAppsecResponse(span, "plain text", "200", { kind: "buffered", supportsInference: true });

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

      processAppsecResponse(span, undefined, "502", { kind: "buffered", supportsInference: true });

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "502",
        responseHeaders: undefined,
        responseBody: undefined,
        isBase64Encoded: false,
      });
    });

    it("should publish no body when a proxy integration response carries none", () => {
      const span = { setTag: jest.fn() };

      processAppsecResponse(span, { statusCode: 204, body: null }, "204", {
        kind: "buffered",
        supportsInference: true,
      });

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
