import * as eventType from "../utils/event-type-guards";

export interface ExtractedHTTPData {
  headers: Record<string, string>;
  method: string;
  path: string;
  query?: Record<string, string | string[]>;
  body?: string | object;
  isBase64Encoded: boolean;
  clientIp?: string;
  pathParams?: Record<string, string>;
  cookies?: Record<string, string>;
  route?: string;
}

export function extractHTTPDataFromEvent(event: any): ExtractedHTTPData | undefined {
  if (eventType.isLambdaUrlEvent(event)) {
    return extractFromLambdaUrl(event);
  }

  if (eventType.isAPIGatewayEvent(event)) {
    return extractFromApiGatewayV1(event);
  }

  if (eventType.isAPIGatewayEventV2(event)) {
    return extractFromApiGatewayV2(event);
  }

  if (eventType.isALBEvent(event)) {
    return extractFromALB(event);
  }

  return undefined;
}

function extractFromApiGatewayV1(event: any): ExtractedHTTPData {
  const headers = normalizeHeaders(event.headers, event.multiValueHeaders);
  const { cookies, headersNoCookies } = separateCookies(headers);

  return {
    headers: headersNoCookies,
    method: event.httpMethod || "",
    path: event.requestContext?.path || event.path || "/",
    query: mergeQueryParams(event.queryStringParameters, event.multiValueQueryStringParameters),
    body: decodeBody(event.body, event.isBase64Encoded),
    isBase64Encoded: !!event.isBase64Encoded,
    clientIp: event.requestContext?.identity?.sourceIp,
    pathParams: event.pathParameters || undefined,
    cookies,
    route: event.resource,
  };
}

function extractFromApiGatewayV2(event: any): ExtractedHTTPData {
  const headers = normalizeHeaders(event.headers);
  const { headersNoCookies } = separateCookies(headers);

  const cookies = parseCookieArray(event.cookies) || parseCookieHeader(headers.cookie);

  let route: string | undefined;
  if (event.routeKey) {
    const parts = event.routeKey.split(" ");
    route = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  }

  return {
    headers: headersNoCookies,
    method: event.requestContext?.http?.method || "",
    path: event.rawPath || event.requestContext?.http?.path || "/",
    query: event.queryStringParameters || undefined,
    body: decodeBody(event.body, event.isBase64Encoded),
    isBase64Encoded: !!event.isBase64Encoded,
    clientIp: event.requestContext?.http?.sourceIp,
    pathParams: event.pathParameters || undefined,
    cookies,
    route,
  };
}

function extractFromALB(event: any): ExtractedHTTPData {
  const headers = normalizeHeaders(event.headers, event.multiValueHeaders);
  const { cookies, headersNoCookies } = separateCookies(headers);

  const forwardedFor = headers["x-forwarded-for"];
  const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : undefined;

  return {
    headers: headersNoCookies,
    method: event.httpMethod || "",
    path: event.path || "/",
    query: mergeQueryParams(event.queryStringParameters, event.multiValueQueryStringParameters),
    body: decodeBody(event.body, event.isBase64Encoded),
    isBase64Encoded: !!event.isBase64Encoded,
    clientIp,
    cookies,
  };
}

function extractFromLambdaUrl(event: any): ExtractedHTTPData {
  const headers = normalizeHeaders(event.headers);
  const { headersNoCookies } = separateCookies(headers);

  const cookies = parseCookieArray(event.cookies) || parseCookieHeader(headers.cookie);

  return {
    headers: headersNoCookies,
    method: event.requestContext?.http?.method || "",
    path: event.rawPath || event.requestContext?.http?.path || "/",
    query: event.queryStringParameters || undefined,
    body: decodeBody(event.body, event.isBase64Encoded),
    isBase64Encoded: !!event.isBase64Encoded,
    clientIp: event.requestContext?.http?.sourceIp,
    cookies,
  };
}

function normalizeHeaders(
  headers?: Record<string, string>,
  multiValueHeaders?: Record<string, string[]>,
): Record<string, string> {
  if (!headers && !multiValueHeaders) return {};

  const result: Record<string, string> = {};

  if (multiValueHeaders) {
    for (const [key, values] of Object.entries(multiValueHeaders)) {
      if (values && values.length > 0) {
        result[key.toLowerCase()] = values.join(", ");
      }
    }
  }

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (!(lowerKey in result) && value !== undefined) {
        result[lowerKey] = value;
      }
    }
  }

  return result;
}

function separateCookies(headers: Record<string, string>): {
  cookies: Record<string, string> | undefined;
  headersNoCookies: Record<string, string>;
} {
  const cookies = parseCookieHeader(headers.cookie);
  const headersNoCookies = { ...headers };
  delete headersNoCookies.cookie;
  return { cookies, headersNoCookies };
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> | undefined {
  if (!cookieHeader) return undefined;

  const result: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const name = pair.substring(0, eqIdx).trim();
    const value = pair.substring(eqIdx + 1).trim();
    if (name) {
      result[name] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseCookieArray(cookies: string[] | undefined): Record<string, string> | undefined {
  if (!cookies || !Array.isArray(cookies) || cookies.length === 0) return undefined;

  const result: Record<string, string> = {};
  for (const cookie of cookies) {
    const eqIdx = cookie.indexOf("=");
    if (eqIdx === -1) continue;
    const name = cookie.substring(0, eqIdx).trim();
    const value = cookie.substring(eqIdx + 1).trim();
    if (name) {
      result[name] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function mergeQueryParams(
  single?: Record<string, string> | null,
  multi?: Record<string, string[]> | null,
): Record<string, string | string[]> | undefined {
  if (!single && !multi) return undefined;

  const result: Record<string, string | string[]> = {};

  if (multi) {
    for (const [key, values] of Object.entries(multi)) {
      if (values && values.length > 0) {
        result[key] = values.length === 1 ? values[0] : values;
      }
    }
  } else if (single) {
    for (const [key, value] of Object.entries(single)) {
      if (value !== undefined && value !== null) {
        result[key] = value;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function decodeBody(body: string | undefined | null, isBase64Encoded: boolean): string | object | undefined {
  if (body === undefined || body === null) return undefined;

  let decoded = body;
  if (isBase64Encoded) {
    try {
      decoded = Buffer.from(body, "base64").toString("utf-8");
    } catch {
      return body;
    }
  }

  try {
    return JSON.parse(decoded);
  } catch {
    return decoded;
  }
}
