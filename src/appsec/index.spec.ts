const mockPublish = jest.fn();

jest.mock("dc-polyfill", () => ({
  channel: jest.fn(() => ({
    publish: mockPublish,
    hasSubscribers: true,
  })),
}));

import { initAppsec, processAppsecRequest, processAppsecResponse } from "./index";

jest.mock("./event-data-extractor", () => ({
  extractHTTPDataFromEvent: jest.fn(),
}));

import { extractHTTPDataFromEvent } from "./event-data-extractor";

const mockExtract = extractHTTPDataFromEvent as jest.MockedFunction<typeof extractHTTPDataFromEvent>;

describe("AppSec orchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("initAppsec", () => {
    it("should enable when called with true", () => {
      initAppsec(true);

      const span = { setTag: jest.fn() };
      mockExtract.mockReturnValue({
        headers: { host: "example.com" },
        method: "GET",
        path: "/",
        isBase64Encoded: false,
      });

      processAppsecRequest({}, span);
      expect(mockPublish).toHaveBeenCalled();
    });

    it("should not enable when called with false", () => {
      initAppsec(false);

      processAppsecRequest({}, {});
      expect(mockPublish).not.toHaveBeenCalled();
    });
  });

  describe("processAppSecRequest", () => {
    beforeEach(() => {
      initAppsec(true);
    });

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
    beforeEach(() => {
      initAppsec(true);
    });

    it("should not publish when span is falsy", () => {
      processAppsecResponse(null, "200");
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it("should publish response data to the end-invocation channel", () => {
      const span = { setTag: jest.fn() };

      processAppsecResponse(span, "200", { "content-type": "application/json" });

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: "200",
        responseHeaders: { "content-type": "application/json" },
      });
    });

    it("should publish with undefined statusCode and headers", () => {
      const span = { setTag: jest.fn() };

      processAppsecResponse(span);

      expect(mockPublish).toHaveBeenCalledWith({
        span,
        statusCode: undefined,
        responseHeaders: undefined,
      });
    });
  });
});
