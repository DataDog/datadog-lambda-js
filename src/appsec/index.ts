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
    responseBody: extractResponseBody(result),
    isBase64Encoded: !!result?.isBase64Encoded,
  });
}

/**
 * Response headers reach the tracer in the same shape as the request ones. A result that carries
 * no headers at all is served by API Gateway and by Function URLs as `application/json`, so that
 * is the default, which is also what makes a raw string body eligible for schema extraction.
 */
function normalizeResponseHeaders(result: any): Record<string, string> {
  const headers = result?.headers as Record<string, unknown> | undefined;
  const multiValueHeaders = result?.multiValueHeaders as Record<string, unknown[]> | undefined;

  if (!headers && !multiValueHeaders) return { "content-type": "application/json" };

  return normalizeHeaders(headers, multiValueHeaders);
}

/**
 * The body is published raw, exactly as the handler wrote it. Base64 decoding, content type gating
 * and size limits belong to the tracer, which is the side that knows what the WAF accepts.
 *
 * `statusCode` is the discriminator API Gateway itself uses: without it, payload format 2.0 and
 * Function URLs treat the whole result as the body, so keys like `body` or `headers` are payload
 * data rather than an envelope.
 */
function extractResponseBody(result: any): unknown {
  if (result === undefined || result === null) return undefined;

  if (typeof result !== "object") return result;

  if ("statusCode" in result) return result.body ?? undefined;

  return result;
}
