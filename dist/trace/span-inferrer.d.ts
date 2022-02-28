import { Context, SNSMessage } from "aws-lambda";
import { SpanContext, TracerWrapper } from "./tracer-wrapper";
import { SpanWrapper } from "./span-wrapper";
export declare class SpanInferrer {
    traceWrapper: TracerWrapper;
    constructor(traceWrapper: TracerWrapper);
    createInferredSpan(event: any, context: Context | undefined, parentSpanContext: SpanContext | undefined): any;
    isApiGatewayAsync(event: any): boolean;
    createInferredSpanForApiGateway(event: any, context: Context | undefined, parentSpanContext: SpanContext | undefined): SpanWrapper;
    createInferredSpanForDynamoDBStreamEvent(event: any, context: Context | undefined, parentSpanContext: SpanContext | undefined): SpanWrapper;
    createInferredSpanForSns(event: any, context: Context | undefined, parentSpanContext: SpanContext | undefined): SpanWrapper;
    createInferredSpanForSqsSns(event: SNSMessage, context: Context | undefined, parentSpanContext: SpanContext | undefined): SpanWrapper;
    createInferredSpanForSqs(event: any, context: Context | undefined, parentSpanContext: SpanContext | undefined): SpanWrapper;
    createInferredSpanForKinesis(event: any, context: Context | undefined, parentSpanContext: SpanContext | undefined): SpanWrapper;
    createInferredSpanForS3(event: any, context: Context | undefined, parentSpanContext: SpanContext | undefined): SpanWrapper;
    createInferredSpanForEventBridge(event: any, context: Context | undefined, parentSpanContext: SpanContext | undefined): SpanWrapper;
}
//# sourceMappingURL=span-inferrer.d.ts.map