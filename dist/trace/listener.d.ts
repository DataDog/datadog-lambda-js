import { Context } from "aws-lambda";
import { TraceContext } from "./context";
export declare type TraceExtractor = (event: any, context: Context) => TraceContext;
export interface TraceConfig {
    /**
     * Whether to automatically patch all outgoing http requests with Datadog's hybrid tracing headers.
     * @default true.
     */
    autoPatchHTTP: boolean;
    /**
     * Whether to capture the lambda payload and response in Datadog.
     */
    captureLambdaPayload: boolean;
    /**
     * Whether to create inferred spans for managed services
     */
    createInferredSpan: boolean;
    /**
     * Whether to automatically patch console.log with Datadog's tracing ids.
     */
    injectLogContext: boolean;
    /**
     * Whether to merge traces produced from dd-trace with X-Ray
     * @default false
     */
    mergeDatadogXrayTraces: boolean;
    /**
     * Custom trace extractor function
     */
    traceExtractor?: TraceExtractor;
}
export declare class TraceListener {
    private config;
    private contextService;
    private context?;
    private stepFunctionContext?;
    private tracerWrapper;
    private inferrer;
    private inferredSpan?;
    private wrappedCurrentSpan?;
    private triggerTags?;
    private lambdaSpanParentContext?;
    get currentTraceHeaders(): Partial<import("./trace-context-service").TraceHeaders>;
    constructor(config: TraceConfig);
    onStartInvocation(event: any, context: Context): void;
    /**
     * onEndingInvocation runs after the user function has returned
     * but before the wrapped function has returned
     * this is needed to apply tags to the lambda span
     * before it is flushed to logs or extension
     *
     * @param event
     * @param result
     * @param shouldTagPayload
     */
    onEndingInvocation(event: any, result: any, shouldTagPayload?: boolean): void;
    onCompleteInvocation(): Promise<void>;
    onWrap<T = (...args: any[]) => any>(func: T): T;
}
//# sourceMappingURL=listener.d.ts.map