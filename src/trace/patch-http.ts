import http from "http";
import https from "https";
import * as shimmer from "shimmer";
import { parse, URL } from "url";

import { TraceContextService } from "./trace-context-service";

type RequestCallback = (res: http.IncomingMessage) => void;

/**
 * Patches outgoing http calls to include DataDog's tracing headers.
 * @param contextService Provides up to date tracing context.
 */
export function patchHttp(contextService: TraceContextService) {
  patchMethod(http, "request", contextService);
  // In newer Node versions references internal to modules, such as `http(s).get` calling `http(s).request`, do
  // not use externally patched versions, which is why we need to also patch `get` here separately.
  patchMethod(http, "get", contextService);
  // Note, below Node v9, the `https` module invokes `http.request`. We choose to wrap both anyway, as it's safe
  // to invoke the patch handler twice.
  patchMethod(https, "request", contextService);
  patchMethod(https, "get", contextService);
}

/**
 * Removes http patching to add DataDog's tracing headers.
 */
export function unpatchHttp() {
  unpatchMethod(http, "request");
  unpatchMethod(http, "get");
  unpatchMethod(https, "request");
  unpatchMethod(https, "get");
}

function patchMethod(mod: typeof http | typeof https, method: "get" | "request", contextService: TraceContextService) {
  shimmer.wrap(mod, method, (original) => {
    const fn = (arg1: any, arg2: any, arg3: any) => {
      const { options, callback } = normalizeArgs(arg1, arg2, arg3);
      const requestOpts = getRequestOptionsWithTraceContext(options, contextService);

      if (isIntegrationTest()) {
        _logHttpRequest(requestOpts);
      }

      return original(requestOpts, callback);
    };
    return fn as any;
  });
}
function unpatchMethod(mod: typeof http | typeof https, method: "get" | "request") {
  if (mod[method].__wrapped !== undefined) {
    shimmer.unwrap(mod, method);
  }
}

/**
 * The input into the http.request function has 6 different overloads. This method normalized the inputs
 * into a consistent format.
 */
function normalizeArgs(
  arg1: string | URL | http.RequestOptions,
  arg2?: RequestCallback | http.RequestOptions,
  arg3?: RequestCallback,
) {
  let options: http.RequestOptions = typeof arg1 === "string" ? parse(arg1) : { ...arg1 };
  options.headers = options.headers || {};
  let callback = arg3;
  if (typeof arg2 === "function") {
    callback = arg2;
  } else if (typeof arg2 === "object") {
    options = { ...options, ...arg2 };
  }
  return { options, callback };
}

function getRequestOptionsWithTraceContext(
  options: http.RequestOptions,
  traceService: TraceContextService,
): http.RequestOptions {
  let { headers } = options;
  if (headers === undefined) {
    headers = {};
  }
  const traceHeaders = traceService.currentTraceHeaders;
  headers = {
    ...headers,
    ...traceHeaders,
  };
  return {
    ...options,
    headers,
  };
}

function isIntegrationTest() {
  const integrationTestEnvVar = process.env.DD_INTEGRATION_TEST;
  if (typeof integrationTestEnvVar !== "string") {
    return false;
  }

  return integrationTestEnvVar.toLowerCase() === "true";
}

/**
 * Log each HTTP request in this format for integration tests:
 * HTTP GET https://ip-ranges.datadoghq.com/ Headers: ["x-datadog-parent-id:abc"] Data: {}
 * @param options The options for the HTTP request
 */
function _logHttpRequest(options: http.RequestOptions) {
  let headerMessage = "Headers: []";

  if (options.headers) {
    const headerStrings = Object.entries(options.headers).map(([name, value]) => `${name}:${value}`);
    headerStrings.sort();
    headerMessage = `Headers: ${JSON.stringify(headerStrings)}`;
  }

  const url = `${options.protocol}//${options.host || options.hostname}${options.path}`;

  const requestMessage = `HTTP ${options.method} ${url} ${headerMessage}\n`;
  process.stdout.write(requestMessage);
}
