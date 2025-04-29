import { EventValidator } from "../../../utils/event-validator";
import { logDebug } from "../../../utils";
import { EventTraceExtractor } from "../extractor";
import { TracerWrapper } from "../../tracer-wrapper";
import { SpanContextWrapper } from "../../span-context-wrapper";

export const AUTHORIZING_REQUEST_ID_HEADER = "x-datadog-authorizing-requestid";

export enum HTTPEventSubType {
  ApiGatewayV1 = "api-gateway-rest-api",
  ApiGatewayV2 = "api-gateway-http-api",
  ApiGatewayWebSocket = "api-gateway-websocket",
  Unknown = "unknown-sub-type",
}

export class HTTPEventTraceExtractor implements EventTraceExtractor {
  constructor(private tracerWrapper: TracerWrapper, private decodeAuthorizerContext: boolean = true) {
    this.decodeAuthorizerContext = decodeAuthorizerContext;
  }

  extract(event: any): SpanContextWrapper | null {
    if (this.decodeAuthorizerContext) {
      // need to set the trace context if using authorizer lambda in authorizing (non-cached) cases
      try {
        const eventSourceSubType: HTTPEventSubType = HTTPEventTraceExtractor.getEventSubType(event);
        const injectedAuthorizerHeaders = HTTPEventTraceExtractor.getInjectedAuthorizerHeaders(
          event,
          eventSourceSubType,
        );
        if (injectedAuthorizerHeaders !== null) {
          const _traceContext = this.tracerWrapper.extract(injectedAuthorizerHeaders);
          if (_traceContext === null) return null;

          logDebug(`Extracted trace context from authorizer event`, { traceContext: _traceContext, event });
          return _traceContext;
        }
      } catch (error) {
        if (error instanceof Error) {
          logDebug(`Unable to extract trace context from authorizer event.`, error);
        }
      }
    }

    const headers = event.headers ?? event.multiValueHeaders;
    const lowerCaseHeaders: { [key: string]: string } = {};

    for (const [key, val] of Object.entries(headers)) {
      if (Array.isArray(val)) {
        // MultiValueHeaders: take the first value
        lowerCaseHeaders[key.toLowerCase()] = val[0] ?? "";
      } else if (typeof val === "string") {
        // Single‐value header
        lowerCaseHeaders[key.toLowerCase()] = val;
      }
    }

    const traceContext = this.tracerWrapper.extract(lowerCaseHeaders);
    if (traceContext === null) return null;

    logDebug(`Extracted trace context from HTTP event`, { traceContext, event });
    return traceContext;
  }

  public static getEventSubType(event: any): HTTPEventSubType {
    if (EventValidator.isAPIGatewayEvent(event)) {
      return HTTPEventSubType.ApiGatewayV1;
    }

    if (EventValidator.isAPIGatewayEventV2(event)) {
      return HTTPEventSubType.ApiGatewayV2;
    }

    if (EventValidator.isAPIGatewayWebSocketEvent(event)) {
      return HTTPEventSubType.ApiGatewayWebSocket;
    }

    return HTTPEventSubType.Unknown;
  }

  public static getInjectedAuthorizerHeaders(event: any, eventSubType: HTTPEventSubType) {
    const authorizerHeaders = event?.requestContext?.authorizer;
    if (!authorizerHeaders) return null;

    let rawDatadogData = authorizerHeaders._datadog;
    if (eventSubType === HTTPEventSubType.ApiGatewayV2) {
      rawDatadogData = authorizerHeaders.lambda._datadog;
    }
    if (!rawDatadogData) return null;

    const injectedData = JSON.parse(Buffer.from(rawDatadogData, "base64").toString());

    if (
      authorizerHeaders.integrationLatency > 0 ||
      event.requestContext.requestId === injectedData[AUTHORIZING_REQUEST_ID_HEADER]
    ) {
      return injectedData;
    }

    return null;
  }
}
