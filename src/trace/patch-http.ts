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
      [arg1, arg2, arg3] = addTraceContextToArgs(contextService, arg1, arg2, arg3);

      if (arg3 === undefined || arg3 === null) {
        return original(arg1, arg2);
      } else {
        return original(arg1, arg2, arg3);
      }
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
 * Finds the RequestOptions in the args and injects context into headers
 */
function addTraceContextToArgs(
  contextService: TraceContextService,
  arg1: string | URL | http.RequestOptions,
  arg2?: RequestCallback | http.RequestOptions,
  arg3?: RequestCallback,
) {
  let requestOpts: http.RequestOptions | undefined;
  if (typeof arg1 === "string" || arg1 instanceof URL) {
    if (arg2 === undefined || arg2 === null) {
      requestOpts = {
        method: "GET",
      };
      requestOpts = getRequestOptionsWithTraceContext(requestOpts, contextService);
      return [arg1, requestOpts, arg3];
    } else if (typeof arg2 === "function") {
      requestOpts = {
        method: "GET",
      };
      requestOpts = getRequestOptionsWithTraceContext(requestOpts, contextService);
      return [arg1, requestOpts, arg2];
    } else {
      requestOpts = arg2 as http.RequestOptions;
      requestOpts = getRequestOptionsWithTraceContext(requestOpts, contextService);
      return [arg1, requestOpts, arg3];
    }
  } else {
    requestOpts = getRequestOptionsWithTraceContext(arg1, contextService);
    return [requestOpts, arg2, arg3];
  }
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
  const requestOpts = {
    ...options,
    headers,
  };
  // Logging all http requests during integration tests let's
  // us track traffic in our test snapshots
  if (isIntegrationTest()) {
    _logHttpRequest(requestOpts);
  }
  return requestOpts;
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
