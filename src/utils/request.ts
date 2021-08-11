import https, { RequestOptions } from "https";
import http from "http";
import { URL } from "url";
import { logDebug } from "./log";

type RequestResult = {
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
};

export function post<T>(url: URL, body: T, options?: Partial<RequestOptions>): Promise<RequestResult> {
  const bodyJSON = JSON.stringify(body);
  const buffer = Buffer.from(bodyJSON);
  logDebug(`sending payload with body ${bodyJSON}`);
  const requestOptions: RequestOptions = {
    headers: { "content-type": "application/json" },
    host: url.host,
    hostname: url.hostname,
    method: "POST",
    path: `${url.pathname}${url.search}`,
    port: url.port,
    protocol: url.protocol,
    ...options,
  };
  return sendRequest(url, requestOptions, buffer);
}

export function get(url: URL, options?: Partial<RequestOptions>): Promise<RequestResult> {
  const requestOptions: RequestOptions = {
    headers: { "content-type": "application/json" },
    host: url.host,
    hostname: url.hostname,
    method: "GET",
    path: `${url.pathname}${url.search}`,
    port: url.port,
    protocol: url.protocol,
    ...options,
  };
  return sendRequest(url, requestOptions);
}

function sendRequest(url: URL, options: RequestOptions, buffer?: Buffer): Promise<RequestResult> {
  return new Promise((resolve) => {
    const requestMethod = url.protocol === "https:" ? https.request : http.request;

    const request = requestMethod(options, (response) => {
      const statusCode = response.statusCode;

      if (statusCode === undefined || statusCode < 200 || statusCode > 299) {
        return resolve({
          success: false,
          statusCode,
          errorMessage: `HTTP error code: ${response.statusCode}`,
        });
      }

      return resolve({
        success: true,
        statusCode,
      });
    });

    request.on("error", (error) => {
      resolve({
        success: false,
        errorMessage: error.message,
      });
    });

    if (buffer) {
      request.write(buffer);
    }

    request.end();
  });
}
