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
      processAppsecResponse(null, { statusCode: 200 });
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it("should publish the normalized status code and the response headers", () => {
      const span = { setTag: jest.fn() };

      processAppsecResponse(span, { statusCode: 200, headers: { "content-type": "application/json" } }, "200");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
      });
    });

    it("should publish with undefined statusCode and headers when result has none", () => {
      const span = { setTag: jest.fn() };

      processAppsecResponse(span, {});

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: undefined,
        responseHeaders: undefined,
      });
    });

    it("should ignore the status code carried by the result", () => {
      const span = { setTag: jest.fn() };

      processAppsecResponse(span, { statusCode: 200 }, "502");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "502",
        responseHeaders: undefined,
      });
    });

    it("should publish the normalized status code when the result carries none", () => {
      const span = { setTag: jest.fn() };

      processAppsecResponse(span, { headers: { "content-type": "application/json" } }, "200");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
      });
    });

    it("should lowercase the response header names", () => {
      const span = { setTag: jest.fn() };

      processAppsecResponse(span, { statusCode: 200, headers: { "X-Option": "test_value" } }, "200");

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "x-option": "test_value" },
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
      );

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json", "x-option": "a, b" },
      });
    });

    it("should publish no status code when none is normalized, even if the result carries one", () => {
      const span = { setTag: jest.fn() };

      processAppsecResponse(span, { statusCode: 204 }, undefined);

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: undefined,
        responseHeaders: undefined,
      });
    });
  });
});
