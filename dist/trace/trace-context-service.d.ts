import { Context } from "aws-lambda";
import { parentIDHeader, samplingPriorityHeader, traceIDHeader } from "./constants";
import { TraceContext } from "./context";
import { TracerWrapper } from "./tracer-wrapper";
import { TraceExtractor } from "./listener";
/**
 * Headers that can be added to a request.
 */
export interface TraceHeaders {
    [traceIDHeader]: string;
    [parentIDHeader]: string;
    [samplingPriorityHeader]: string;
}
/**
 * Service for retrieving the latest version of the request context from xray.
 */
export declare class TraceContextService {
    private tracerWrapper;
    private rootTraceContext?;
    constructor(tracerWrapper: TracerWrapper);
    extractHeadersFromContext(event: any, context: Context, extractor?: TraceExtractor): Partial<TraceHeaders> | undefined;
    get currentTraceContext(): TraceContext | undefined;
    get currentTraceHeaders(): Partial<TraceHeaders>;
    get rootTraceHeaders(): Partial<TraceHeaders>;
    get traceSource(): import("./constants").Source | undefined;
}
//# sourceMappingURL=trace-context-service.d.ts.map