import querystring from "querystring";
import { URL } from "url";

import { logDebug, post, isHTTPError, HTTPErrorType } from "../utils";
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

  public async sendMetrics(metrics: APIMetric[]): Promise<void> {
    try {
      await post(this.getUrl("api/v1/distribution_points"), { series: metrics });
    } catch (e) {
      if (!isHTTPError(e)) {
        logDebug(`Failed to send metrics ${e}`);
        throw e;
      }
      if (e.type === HTTPErrorType.BadAuth) {
        logDebug(`authorization failed with api key of length ${this.apiKey.length} characters`);
      }
      if (e.type === HTTPErrorType.FailedSend) {
        logDebug(`Failed to send metrics ${e.message}`);
        throw Error(`Failed to send metrics: ${e.message}`);
      }
      throw e.message;
    }
  }

  private getUrl(path: string) {
    const url = new URL(path, this.baseAPIURL);
    logDebug(`sending metadata to api endpoint ${url.toString()}`);
    url.search = querystring.stringify({ [apiKeyQueryParam]: this.apiKey });
    return url;
  }
}
