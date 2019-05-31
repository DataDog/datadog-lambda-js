import http from "http";
import https from "https";
import * as semver from "semver";
import * as shimmer from "shimmer";
import { parse, URL } from "url";

import { parentIDHeader, samplingPriorityHeader, traceIDHeader } from "./constants";
import { TraceContextService } from "./trace-context-service";

type RequestCallback = (res: http.IncomingMessage) => void;

/**
 * Patches outgoing http calls to include DataDog's tracing headers.
 * @param contextService Provides up to date tracing context.
 */
export function patchHttp(contextService: TraceContextService) {
  patchMethod(http, "request", contextService);
  if (semver.satisfies(process.version, ">=8")) {
    // In newer Node versions references internal to modules, such as `http(s).get` calling `http(s).request`, do
    // not use externally patched versions, which is why we need to also patch `get` here separately.
    patchMethod(http, "get", contextService);
  }
  if (semver.satisfies(process.version, ">=9")) {
    // Below Node v9 the `https` module invokes `http.request`, which would end up patching requests twice.
    // So rather then patch the `https` module, we ensure the `http` module is patched.
    patchMethod(https, "request", contextService);
    patchMethod(https, "get", contextService);
  }
}

/**
 * Removes http patching to add DataDog's tracing headers.
 */
export function unpatchHttp() {
  unpatchMethod(http, "request");
  unpatchMethod(https, "request");
  unpatchMethod(http, "request");
}

function patchMethod(mod: typeof http | typeof https, method: "get" | "request", contextService: TraceContextService) {
  shimmer.wrap(mod, method, (original) => {
    const fn = (arg1: any, arg2: any, arg3: any) => {
      const { options, callback } = normalizeArgs(arg1, arg2, arg3);
      const requestOpts = requestOptionsWithTraceContext(options, contextService);

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

function requestOptionsWithTraceContext(
  options: http.RequestOptions,
  traceService: TraceContextService,
): http.RequestOptions {
  let { headers } = options;
  if (headers === undefined) {
    headers = {};
  }
  const context = traceService.currentTraceContext;
  if (context !== undefined) {
    headers[traceIDHeader] = context.traceID;
    headers[parentIDHeader] = context.parentID;
    headers[samplingPriorityHeader] = context.sampleMode.toString(10);
  }
  return {
    ...options,
    headers,
  };
}
