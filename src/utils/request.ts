import https, { RequestOptions } from "https";
import http from "http";
import { URL } from "url";
import { logDebug } from "./log";

export enum HTTPErrorType {
  BadAuth,
  FailedSend,
}

export interface HTTPError {
  type: HTTPErrorType;
  message: string;
  statusCode?: number;
}
export function isHTTPError(error: any): error is HTTPError {
  return typeof error === "object" && Object.values(HTTPErrorType).includes(error["type"]);
}

export function post<T>(url: URL, body: T, options?: Partial<RequestOptions>): Promise<void> {
  const bodyJSON = JSON.stringify(body);
  const buffer = Buffer.from(bodyJSON);
  logDebug(`sending payload with body ${bodyJSON}`);

  return new Promise((resolve, reject) => {
    const requestOptions: RequestOptions = {
      headers: { "content-type": "application/json" },
      host: url.host,
      method: "POST",
      path: `${url.pathname}${url.search}`,
      port: url.port,
      protocol: url.protocol,
      ...options,
    };
    const requestMethod = url.protocol === "https:" ? https.request : http.request;

    const request = requestMethod(requestOptions, (response) => {
      if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode > 299) {
        reject({
          type: HTTPErrorType.BadAuth,
          message: `Invalid status code ${response.statusCode}`,
          statusCode: response.statusCode,
        });
      } else {
        resolve();
      }
    });
    request.on("error", (error) => {
      reject({ type: HTTPErrorType.FailedSend, message: error.message });
    });
    request.write(buffer);
    request.end();
  });
}
