import querystring from "querystring";
import { URL } from "url";

import { logDebug, post } from "../utils";
import { APIMetric } from "./model";

const API_KEY_QUERY_PARAM = "api_key";
const FORBIDDEN_HTTP_STATUS_CODE = 403;

export interface Client {
  sendMetrics(metrics: APIMetric[]): Promise<void>;
}

/**
 * APIClient interfaces with the Datadog API
 */
export class APIClient implements Client {
  constructor(private apiKey: string, private baseAPIURL: string) {}

  public async sendMetrics(metrics: APIMetric[]): Promise<void> {
    const result = await post(this.getUrl("api/v1/distribution_points"), { series: metrics });
    if (result.success) {
      return;
    }

    if (result.statusCode === FORBIDDEN_HTTP_STATUS_CODE) {
      logDebug("authorization failed when sending metrics, please check validity of API key");
    }

    logDebug(`failed attempt to send metrics to Datadog. ${result.errorMessage} `);
    throw result.errorMessage;
  }

  private getUrl(path: string) {
    const url = new URL(path, this.baseAPIURL);
    logDebug(`sending metadata to api endpoint ${url.toString()}`);
    url.search = querystring.stringify({ [API_KEY_QUERY_PARAM]: this.apiKey });
    return url;
  }
}
