import { logDebug } from "../../../utils";
import { eventSubTypes, parseEventSourceSubType } from "../../trigger";
import { TraceContext, exportTraceData } from "../extractor";

export const authorizingRequestIdHeader = "x-datadog-authorizing-requestid";

export function readTraceFromHTTPEvent(event: any, decodeAuthorizerContext: boolean = true): TraceContext | undefined {
  if (decodeAuthorizerContext) {
    // need to set the trace context if using authorizer lambda in authorizing (non-cached) cases
    try {
      const eventSourceSubType: eventSubTypes = parseEventSourceSubType(event);
      const injectedAuthorizerData = getInjectedAuthorizerData(event, eventSourceSubType);
      if (injectedAuthorizerData !== null) {
        return exportTraceData(injectedAuthorizerData);
      }
    } catch (error) {
      logDebug(`unable to extract trace context from authorizer event.`, { error });
    }
  }

  const headers = event.headers;
  const lowerCaseHeaders: { [key: string]: string } = {};

  for (const key of Object.keys(headers)) {
    lowerCaseHeaders[key.toLowerCase()] = headers[key];
  }

  const trace = exportTraceData(lowerCaseHeaders);

  logDebug(`extracted trace context from http event`, { trace, event });
  return trace;
}

export function getInjectedAuthorizerData(event: any, eventSourceSubType: eventSubTypes) {
  const authorizerHeaders = event?.requestContext?.authorizer;
  if (!authorizerHeaders) return null;
  const rawDatadogData =
    eventSourceSubType === eventSubTypes.apiGatewayV2 ? authorizerHeaders.lambda._datadog : authorizerHeaders._datadog;
  if (!rawDatadogData) return null;
  const injectedData = JSON.parse(Buffer.from(rawDatadogData, "base64").toString());
  // use the injected requestId to tell if it's the authorizing invocation (not cached)
  if (
    authorizerHeaders.integrationLatency > 0 ||
    event.requestContext.requestId === injectedData[authorizingRequestIdHeader]
  ) {
    return injectedData;
  } else {
    return null;
  }
}
