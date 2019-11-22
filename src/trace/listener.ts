import { Context } from "aws-lambda";
import Tracer, { SpanContext, SpanOptions, TraceOptions } from "dd-trace";

import { extractTraceContext, readStepFunctionContextFromEvent, StepFunctionContext } from "./context";
import { patchHttp, unpatchHttp } from "./patch-http";
import { TraceContextService } from "./trace-context-service";

import { didFunctionColdStart } from "../utils/cold-start";
import { Source } from "./constants";
import { isTracerInitialized } from "./dd-trace-utils";
import { logDebug } from "utils";

export interface TraceConfig {
  /**
   * Whether to automatically patch all outgoing http requests with Datadog's hybrid tracing headers.
   * @default true.
   */
  autoPatchHTTP: boolean;
  /**
   * Whether to merge traces produced from dd-trace with X-Ray
   * @default false
   */
  mergeDatadogXrayTraces: boolean;
}

export class TraceListener {
  private contextService = new TraceContextService();
  private context?: Context;
  private stepFunctionContext?: StepFunctionContext;

  public get currentTraceHeaders() {
    return this.contextService.currentTraceHeaders;
  }
  constructor(private config: TraceConfig, private handlerName: string) {}

  public onStartInvocation(event: any, context: Context) {
    const tracerInitialized = isTracerInitialized();
    if (this.config.autoPatchHTTP && !tracerInitialized) {
      logDebug("Patching HTTP libraries");
      patchHttp(this.contextService);
    } else {
      logDebug("Not patching HTTP libraries", { autoPatchHTTP: this.config.autoPatchHTTP, tracerInitialized });
    }
    this.context = context;
    this.contextService.rootTraceContext = extractTraceContext(event);
    this.stepFunctionContext = readStepFunctionContextFromEvent(event);
  }

  public async onCompleteInvocation() {
    if (this.config.autoPatchHTTP) {
      logDebug("Unpatching HTTP libraries");
      unpatchHttp();
    }
  }

  public onWrap<T = (...args: any[]) => any>(func: T): T {
    const rootTraceContext = this.currentTraceHeaders;
    let spanContext: SpanContext | null = null;

    if (this.contextService.traceSource === Source.Event || this.config.mergeDatadogXrayTraces) {
      spanContext = Tracer.extract("http_headers", rootTraceContext);
      logDebug("Attempting to find parent for datadog trace trace");
    } else {
      logDebug("Didn't attempt to find parent for datadog trace", {
        traceSource: this.contextService.traceSource,
        mergeDatadogXrayTraces: this.config.mergeDatadogXrayTraces,
      });
    }

    const options: SpanOptions & TraceOptions = {};
    if (this.context) {
      logDebug("Applying lambda context to datadog traces");
      options.tags = {
        cold_start: didFunctionColdStart(),
        function_arn: this.context.invokedFunctionArn,
        request_id: this.context.awsRequestId,
        resource_names: this.context.functionName,
      };
    }
    if (this.stepFunctionContext) {
      logDebug("Applying step function context to datadog traces");
      options.tags = {
        ...options.tags,
        ...this.stepFunctionContext,
      };
    }

    if (spanContext !== null) {
      logDebug("Parenting datadog trace", { traceId: spanContext.toTraceId(), spanId: spanContext.toSpanId() });
      options.childOf = spanContext;
    }
    options.resource = this.handlerName;
    return Tracer.wrap("aws.lambda", options, func);
  }
}
