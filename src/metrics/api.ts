import https, { RequestOptions } from "https";
import querystring from "querystring";
import { URL } from "url";

import { logDebug } from "../utils";
import { APIMetric } from "./model";

const apiKeyQueryParam = "api_key";

export interface Client {
  sendMetrics(metrics: APIMetric[]): Promise<void>;
}

/**
 * APIClient interfaces with the Datadog API
 */
export class APIClient implements Client {
  constructor(private apiKey: string, private baseAPIURL: string) {}

  public sendMetrics(metrics: APIMetric[]): Promise<void> {
    return this.post(this.getUrl("api/v1/distribution_points"), { series: metrics });
  }

  private post<T>(url: URL, body: T): Promise<void> {
    const bodyJSON = JSON.stringify(body);
    const buffer = Buffer.from(bodyJSON);
    logDebug(`sending payload with body ${bodyJSON}`);

    return new Promise((resolve, reject) => {
      const options: RequestOptions = {
        headers: { "content-type": "application/json" },
        host: url.host,
        method: "POST",
        path: `${url.pathname}${url.search}`,
        protocol: url.protocol,
      };

      const request = https.request(options, (response) => {
        if (response.statusCode === undefined || response.statusCode < 200 || response.statusCode > 299) {
          if (response.statusCode === 403) {
            logDebug(`authorization failed with api key of length ${this.apiKey.length} characters`);
          }
          reject(`Invalid status code ${response.statusCode}`);
        } else {
          resolve();
        }
      });
      request.on("error", (error) => {
        reject(`Failed to send metrics: ${error}`);
      });
      request.write(buffer);
      request.end();
    });
  }

  private getUrl(path: string) {
    const url = new URL(path, this.baseAPIURL);
    logDebug(`sending metadata to api endpoint ${url.toString()}`);
    url.search = querystring.stringify({ [apiKeyQueryParam]: this.apiKey });
    return url;
  }
}
