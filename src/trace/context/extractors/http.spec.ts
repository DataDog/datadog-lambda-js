import { TracerWrapper } from "../../tracer-wrapper";
import { HTTPEventSubType, HTTPEventTraceExtractor } from "./http";
const albMultivalueHeadersEvent = require("../../../../event_samples/application-load-balancer-multivalue-headers.json");

let mockSpanContext: any = null;

// Mocking extract is needed, due to dd-trace being a No-op
// if the detected environment is testing. This is expected, since
// we don"t want to test dd-trace extraction, but our components.
jest.mock("dd-trace", () => {
  return {
    ...jest.requireActual("dd-trace"),
    _tracer: { _service: {} },
    extract: (_carrier: any, _headers: any) => mockSpanContext,
  };
});
const spyTracerWrapper = jest.spyOn(TracerWrapper.prototype, "extract");

describe("HTTPEventTraceExtractor", () => {
  describe("extract", () => {
    beforeEach(() => {
      mockSpanContext = null;
    });

    afterEach(() => {
      jest.resetModules();
    });

    it("extracts trace context from payload with headers", () => {
      mockSpanContext = {
        toTraceId: () => "797643193680388254",
        toSpanId: () => "4726693487091824375",
        _sampling: {
          priority: "2",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
        headers: {
          "x-datadog-parent-id": "4726693487091824375",
          "x-datadog-sampling-priority": "2",
          "x-datadog-trace-id": "797643193680388254",
        },
      };

      const extractor = new HTTPEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-parent-id": "4726693487091824375",
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "797643193680388254",
      });

      expect(traceContext?.toTraceId()).toBe("797643193680388254");
      expect(traceContext?.toSpanId()).toBe("4726693487091824375");
      expect(traceContext?.sampleMode()).toBe("2");
      expect(traceContext?.source).toBe("event");
    });

    // The tracer is not handling mixed casing Datadog headers yet
    it("extracts trace context from payload with mixed casing headers", () => {
      mockSpanContext = {
        toTraceId: () => "797643193680388254",
        toSpanId: () => "4726693487091824375",
        _sampling: {
          priority: "2",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
        headers: {
          "X-Datadog-Parent-Id": "4726693487091824375",
          "X-Datadog-Sampling-Priority": "2",
          "X-Datadog-Trace-Id": "797643193680388254",
        },
      };

      const extractor = new HTTPEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-parent-id": "4726693487091824375",
        "x-datadog-sampling-priority": "2",
        "x-datadog-trace-id": "797643193680388254",
      });

      expect(traceContext?.toTraceId()).toBe("797643193680388254");
      expect(traceContext?.toSpanId()).toBe("4726693487091824375");
      expect(traceContext?.sampleMode()).toBe("2");
      expect(traceContext?.source).toBe("event");
    });

    it("extracts trace context from payload with multiValueHeaders", () => {
      mockSpanContext = {
        toTraceId: () => "123",
        toSpanId: () => "456",
        _sampling: { priority: "1" },
      };
      const tracerWrapper = new TracerWrapper();
      const payload = {
        multiValueHeaders: {
          "X-Datadog-Trace-Id": ["123", "789"],
          "X-Datadog-Parent-Id": ["456"],
          "X-Datadog-Sampling-Priority": ["1"],
        },
      };
      const extractor = new HTTPEventTraceExtractor(tracerWrapper);
      const traceContext = extractor.extract(payload);

      expect(traceContext).not.toBeNull();
      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-trace-id": "123",
        "x-datadog-parent-id": "456",
        "x-datadog-sampling-priority": "1",
      });

      expect(traceContext?.toTraceId()).toBe("123");
      expect(traceContext?.toSpanId()).toBe("456");
      expect(traceContext?.sampleMode()).toBe("1");
    });

    it("flattens a real ALB multiValueHeaders payload into a lowercase, single-value map", () => {
      const tracerWrapper = new TracerWrapper();
      const extractor = new HTTPEventTraceExtractor(tracerWrapper);

      spyTracerWrapper.mockClear();
      extractor.extract(albMultivalueHeadersEvent);
      expect(spyTracerWrapper).toHaveBeenCalled();

      const captured = spyTracerWrapper.mock.calls[0][0] as Record<string, string>;

      expect(captured).toEqual({
        accept: "*/*",
        "accept-encoding": "gzip, deflate",
        "accept-language": "*",
        connection: "keep-alive",
        host: "nhulston-test-0987654321.us-east-1.elb.amazonaws.com",
        "sec-fetch-mode": "cors",
        "user-agent": "node",
        traceparent: "00-68126c4300000000125a7f065cf9a530-1c6dcc8ab8a6e99d-01",
        tracestate: "dd=t.dm:-0;t.tid:68126c4300000000;s:1;p:1c6dcc8ab8a6e99d",
        "x-amzn-trace-id": "Root=1-68126c45-01b175997ab51c4c47a2d643",
        "x-datadog-tags": "_dd.p.tid=68126c4300000000,_dd.p.dm=-0",
        "x-datadog-sampling-priority": "1",
        "x-datadog-trace-id": "0987654321",
        "x-datadog-parent-id": "1234567890",
        "x-forwarded-for": "18.204.55.6",
        "x-forwarded-port": "80",
        "x-forwarded-proto": "http",
      });
    });

    it("extracts trace context from payload with authorizer", () => {
      mockSpanContext = {
        toTraceId: () => "2389589954026090296",
        toSpanId: () => "2389589954026090296",
        _sampling: {
          priority: "1",
        },
      };
      const tracerWrapper = new TracerWrapper();

      const payload = {
        requestContext: {
          resourceId: "oozq9u",
          authorizer: {
            _datadog:
              "eyJ4LWRhdGFkb2ctdHJhY2UtaWQiOiIyMzg5NTg5OTU0MDI2MDkwMjk2IiwieC1kYXRhZG9nLXBhcmVudC1pZCI6IjIzODk1ODk5NTQwMjYwOTAyOTYiLCJ4LWRhdGFkb2ctc2FtcGxpbmctcHJpb3JpdHkiOiIxIiwieC1kYXRhZG9nLXBhcmVudC1zcGFuLWZpbmlzaC10aW1lIjoxNjYwOTM5ODk5MjMzLCJ4LWRhdGFkb2ctYXV0aG9yaXppbmctcmVxdWVzdGlkIjoicmFuZG9tLWlkIn0==",
            principalId: "foo",
            integrationLatency: 71,
            preserve: "this key set by a customer",
          },
          stage: "dev",
          requestId: "random-id",
        },
        httpMethod: "GET",
        resource: "/hello",
      };

      const extractor = new HTTPEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).not.toBeNull();

      expect(spyTracerWrapper).toHaveBeenCalledWith({
        "x-datadog-authorizing-requestid": "random-id",
        "x-datadog-parent-id": "2389589954026090296",
        "x-datadog-parent-span-finish-time": 1660939899233,
        "x-datadog-sampling-priority": "1",
        "x-datadog-trace-id": "2389589954026090296",
      });

      expect(traceContext?.toTraceId()).toBe("2389589954026090296");
      expect(traceContext?.toSpanId()).toBe("2389589954026090296");
      expect(traceContext?.sampleMode()).toBe("1");
      expect(traceContext?.source).toBe("event");
    });

    it("returns null when extracted span context by tracer is null", () => {
      const tracerWrapper = new TracerWrapper();

      const payload = {
        headers: {},
      };

      const extractor = new HTTPEventTraceExtractor(tracerWrapper);

      const traceContext = extractor.extract(payload);
      expect(traceContext).toBeNull();
    });
  });

  describe("getEventSubType", () => {
    it.each([
      [
        "ApiGatewayV1",
        "ApiGatewayEvent",
        HTTPEventSubType.ApiGatewayV1,
        {
          requestContext: {
            stage: "dev",
          },
          httpMethod: "POST",
          resource: "my-lambda-resource",
        },
      ],
      [
        "ApiGatewayV2",
        "APIGatewayProxyEventV2",
        HTTPEventSubType.ApiGatewayV2,
        {
          requestContext: {
            domainName: "some-domain",
          },
          version: "2.0",
          rawQueryString: "some-raw-query-string",
        },
      ],
      [
        "ApiGatewayV2",
        "WebSocket event",
        HTTPEventSubType.ApiGatewayWebSocket,
        {
          requestContext: {
            messageDirection: "outbound",
          },
        },
      ],
      [
        "Unknown",
        "any other event",
        HTTPEventSubType.Unknown,
        {
          event_type: "not-api-gateway",
        },
      ],
    ])("returns %s when event is %s", (_, __, _enum, event) => {
      const eventSubType = HTTPEventTraceExtractor.getEventSubType(event);

      expect(eventSubType).toStrictEqual(_enum);
    });
  });
  describe("getInjectedAuthorizerHeaders", () => {
    it("parses authorizer headers properly", () => {
      const payload = {
        requestContext: {
          resourceId: "oozq9u",
          authorizer: {
            _datadog:
              "eyJ4LWRhdGFkb2ctdHJhY2UtaWQiOiIyMzg5NTg5OTU0MDI2MDkwMjk2IiwieC1kYXRhZG9nLXBhcmVudC1pZCI6IjIzODk1ODk5NTQwMjYwOTAyOTYiLCJ4LWRhdGFkb2ctc2FtcGxpbmctcHJpb3JpdHkiOiIxIiwieC1kYXRhZG9nLXBhcmVudC1zcGFuLWZpbmlzaC10aW1lIjoxNjYwOTM5ODk5MjMzLCJ4LWRhdGFkb2ctYXV0aG9yaXppbmctcmVxdWVzdGlkIjoicmFuZG9tLWlkIn0==",
            principalId: "foo",
            integrationLatency: 71,
            preserve: "this key set by a customer",
          },
          stage: "dev",
          requestId: "random-id",
        },
        httpMethod: "GET",
        resource: "/hello",
      };

      const subType = HTTPEventTraceExtractor.getEventSubType(payload);
      const injectedAuthorizerHeaders = HTTPEventTraceExtractor.getInjectedAuthorizerHeaders(payload, subType);

      expect(injectedAuthorizerHeaders).toEqual({
        "x-datadog-trace-id": "2389589954026090296",
        "x-datadog-parent-id": "2389589954026090296",
        "x-datadog-sampling-priority": "1",
        "x-datadog-parent-span-finish-time": 1660939899233,
        "x-datadog-authorizing-requestid": "random-id",
      });
    });

    it.each([
      ["requestContext", {}, HTTPEventSubType.ApiGatewayV1],
      ["requestContext authorizer", { requestContext: {} }, HTTPEventSubType.ApiGatewayV1],
      [
        "_datadog in authorizer - API Gateway V1",
        { requestContext: { authorizer: {} } },
        HTTPEventSubType.ApiGatewayV1,
      ],
      [
        "lambda._datadog in authorizer - API Gateway V2",
        { requestContext: { authorizer: { lambda: {} } } },
        HTTPEventSubType.ApiGatewayV2,
      ],
    ])("returns null and skips parsing when payload is missing '%s'", (_, payload, eventSubType) => {
      const authorizerHeaders = HTTPEventTraceExtractor.getInjectedAuthorizerHeaders(payload, eventSubType);

      expect(authorizerHeaders).toBeNull();
    });

    it.each([
      [
        "integrationLatency < 0",
        {
          requestContext: {
            requestId: "random-id",
            authorizer: {
              _datadog: "e30=",
              integrationLatency: -1,
            },
          },
        },
      ],
      [
        "requestContext requestId not matching the parsed headers requestId",
        {
          requestContext: {
            requestId: "not-random-id",
            authorizer: {
              _datadog:
                "eyJ4LWRhdGFkb2ctdHJhY2UtaWQiOiIyMzg5NTg5OTU0MDI2MDkwMjk2IiwieC1kYXRhZG9nLXBhcmVudC1pZCI6IjIzODk1ODk5NTQwMjYwOTAyOTYiLCJ4LWRhdGFkb2ctc2FtcGxpbmctcHJpb3JpdHkiOiIxIiwieC1kYXRhZG9nLXBhcmVudC1zcGFuLWZpbmlzaC10aW1lIjoxNjYwOTM5ODk5MjMzLCJ4LWRhdGFkb2ctYXV0aG9yaXppbmctcmVxdWVzdGlkIjoicmFuZG9tLWlkIn0==",
            },
          },
        },
      ],
    ])("returns null when parsed headers have '%s'", (_, payload) => {
      const authorizerHeaders = HTTPEventTraceExtractor.getInjectedAuthorizerHeaders(
        payload,
        HTTPEventSubType.ApiGatewayV1,
      );

      expect(authorizerHeaders).toBeNull();
    });
  });
});
