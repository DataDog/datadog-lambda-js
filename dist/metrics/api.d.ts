import { APIMetric } from "./model";
export interface Client {
    sendMetrics(metrics: APIMetric[]): Promise<void>;
}
/**
 * APIClient interfaces with the Datadog API
 */
export declare class APIClient implements Client {
    private apiKey;
    private baseAPIURL;
    constructor(apiKey: string, baseAPIURL: string);
    sendMetrics(metrics: APIMetric[]): Promise<void>;
    private getUrl;
}
//# sourceMappingURL=api.d.ts.map