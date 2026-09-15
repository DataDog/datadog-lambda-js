// tslint:disable-next-line:no-var-requires
const dc = require("dc-polyfill");

import { logDebug } from "../utils";
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

export type ResponseMode = { kind: "streaming" } | { kind: "buffered"; supportsInference: boolean };

/**
 * @param span
 * @param result
 * @param statusCode Status code already normalized by the trigger layer.
 * @param mode `streaming` when the function writes its response to responseStream, in which case
 *             the returned value is not what the client received. `buffered` otherwise, with
 *             `supportsInference` telling whether the trigger serves a result without a status
 *             code as the body, resolved by the trigger layer before the handler ran.
 */
export function processAppsecResponse(
  span: any,
  result: any,
  statusCode: string | undefined,
  mode: ResponseMode,
): void {
  if (!span || !endInvocationChannel.hasSubscribers) return;

  let responseData;
  try {
    responseData = extractResponseData(result, mode);
  } catch {
    logDebug("appsec failed to read the response, publishing the status alone");
    responseData = noResponseData();
  }

  endInvocationChannel.publish({ span, statusCode, ...responseData });
}

function extractResponseData(result: any, mode: ResponseMode) {
  // Streaming functions write the real status, headers and body to responseStream, so nothing
  // about the response can be derived from the returned value.
  if (mode.kind === "streaming") return noResponseData();

  if (isStructuredResponse(result)) {
    return {
      responseHeaders: normalizeResponseHeaders(result),
      responseBody: result.body ?? undefined,
      isBase64Encoded: !!result.isBase64Encoded,
    };
  }

  // The client is answered by the integration error AWS builds, which is not this result.
  if (!mode.supportsInference) return noResponseData();

  // Nothing was returned, so there is no result for the trigger to serve as a JSON body.
  if (result === undefined || result === null) return noResponseData();

  return {
    responseHeaders: { "content-type": "application/json" },
    responseBody: result,
    isBase64Encoded: false,
  };
}

function noResponseData() {
  return { responseHeaders: undefined, responseBody: undefined, isBase64Encoded: false };
}

function isStructuredResponse(result: any): boolean {
  return typeof result === "object" && result !== null && result.statusCode !== undefined;
}

function normalizeResponseHeaders(result: any): Record<string, string> | undefined {
  const headers = result.headers as Record<string, unknown> | undefined;
  const multiValueHeaders = result.multiValueHeaders as Record<string, unknown[]> | undefined;

  if (!headers && !multiValueHeaders) return undefined;

  return normalizeHeaders(headers, multiValueHeaders);
}
