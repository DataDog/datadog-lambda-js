import { KMSService } from "./kms-service";
export interface MetricsConfig {
    /**
     * Whether to retry sending metrics when flushing at the end of the lambda.
     * This can potentially delay the completion of your lambda.
     * @default false
     */
    shouldRetryMetrics: boolean;
    /**
     * The api key used to talk to the Datadog API. If this is empty, apiKeyKMS key
     * will be used instead.
     */
    apiKey: string;
    /**
     * A KMS encrypted api key used to talk to the Datadog API. It will automatically
     * be decrypted before any metrics are sent.
     */
    apiKeyKMS: string;
    /**
     * The site of the Datadog URL to send to. This should either be 'datadoghq.com', (default),
     * or 'datadoghq.eu', for customers in the eu.
     * @default "datadoghq.com"
     */
    siteURL: string;
    /**
     * Whether to send metrics to cloud watch for log forwarding, rather than directly to the Datadog
     * API. This method requires more setup work, but when enabled won't have any effect on your lambda's performance.
     * @default false
     */
    logForwarding: boolean;
    /**
     * Whether to increment invocations and errors Lambda integration metrics from this layer.
     * @default false
     */
    enhancedMetrics: boolean;
}
export declare class MetricsListener {
    private kmsClient;
    private config;
    private currentProcessor?;
    private apiKey;
    private statsDClient?;
    private isAgentRunning?;
    constructor(kmsClient: KMSService, config: MetricsConfig);
    onStartInvocation(_: any): Promise<void>;
    onCompleteInvocation(): Promise<void>;
    sendDistributionMetricWithDate(name: string, value: number, metricTime: Date, forceAsync: boolean, ...tags: string[]): void;
    sendDistributionMetric(name: string, value: number, forceAsync: boolean, ...tags: string[]): void;
    private createProcessor;
    private getAPIKey;
}
//# sourceMappingURL=listener.d.ts.map