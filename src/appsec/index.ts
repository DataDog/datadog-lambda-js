// tslint:disable-next-line:no-var-requires
const dc = require("dc-polyfill");

import { extractHTTPDataFromEvent } from "./event-data-extractor";

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
 * @param statusCode Status code already normalized by the trigger layer. Falls back to the raw
 *   `result.statusCode` when the caller has none, which happens for non-HTTP triggers.
 */
export function processAppsecResponse(span: any, result: any, statusCode?: string): void {
  if (!span || !endInvocationChannel.hasSubscribers) return;

  endInvocationChannel.publish({
    span,
    statusCode: statusCode ?? result?.statusCode?.toString(),
    responseHeaders: result?.headers as Record<string, string> | undefined,
  });
}
