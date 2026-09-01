// tslint:disable-next-line:no-var-requires
const dc = require("dc-polyfill");

import { extractHTTPDataFromEvent } from "./event-data-extractor";
import { normalizeHeaders } from "./headers";

const startInvocationChannel = dc.channel("datadog:lambda:start-invocation");
const endInvocationChannel = dc.channel("datadog:lambda:end-invocation");

export function processAppsecRequest(event: any, span: any): void {
  if (!span || !startInvocationChannel.hasSubscribers) return;

  const httpData = extractHTTPDataFromEvent(event);
  if (!httpData) {
    span.setTag("_dd.appsec.unsupported_event_type", 1);
    return;
  }

  startInvocationChannel.publish({
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
}

/**
 * @param span
 * @param result
 * @param statusCode Status code already normalized by the trigger layer.
 */
export function processAppsecResponse(span: any, result: any, statusCode?: string): void {
  if (!span || !endInvocationChannel.hasSubscribers) return;

  endInvocationChannel.publish({
    span,
    statusCode,
    responseHeaders: normalizeResponseHeaders(result),
  });
}

/**
 * Response headers reach the tracer in the same shape as the request ones
 */
function normalizeResponseHeaders(result: any): Record<string, string> | undefined {
  const headers = result?.headers as Record<string, unknown> | undefined;
  const multiValueHeaders = result?.multiValueHeaders as Record<string, unknown[]> | undefined;

  if (!headers && !multiValueHeaders) return undefined;

  return normalizeHeaders(headers, multiValueHeaders);
}
