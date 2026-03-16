// tslint:disable-next-line:no-var-requires
const dc = require("dc-polyfill");

import { extractHTTPDataFromEvent } from "./event-data-extractor";

const startInvocationChannel = dc.channel("datadog:lambda:start-invocation");
const endInvocationChannel = dc.channel("datadog:lambda:end-invocation");

let enabled = false;

export function initAppsec(): void {
  const envValue = process.env.DD_APPSEC_ENABLED;
  enabled = envValue === "true" || envValue === "1";
}

export function processAppsecRequest(event: any, span: any): void {
  if (!enabled || !span || !startInvocationChannel.hasSubscribers) return;

  const httpData = extractHTTPDataFromEvent(event);
  if (!httpData ) {
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

export function processAppsecResponse(span: any, statusCode?: string, responseHeaders?: Record<string, string>): void {
  if (!enabled || !span || !endInvocationChannel.hasSubscribers) return;

  endInvocationChannel.publish({
    span,
    statusCode,
    responseHeaders,
  });
}
