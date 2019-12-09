import { Context } from "aws-lambda";

import { extractTraceContext, readStepFunctionContextFromEvent, StepFunctionContext } from "./context";
import { patchHttp, unpatchHttp } from "./patch-http";
import { TraceContextService } from "./trace-context-service";

import { logDebug } from "../utils";
import { didFunctionColdStart } from "../utils/cold-start";
import { Source } from "./constants";
import { SpanContext, TraceOptions, TracerWrapper } from "./tracer-wrapper";

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
  private contextService: TraceContextService;
  private context?: Context;
  private stepFunctionContext?: StepFunctionContext;
  private tracerWrapper: TracerWrapper;

  public get currentTraceHeaders() {
    return this.contextService.currentTraceHeaders;
  }
  constructor(private config: TraceConfig, private handlerName: string) {
    this.tracerWrapper = new TracerWrapper();
    this.contextService = new TraceContextService(this.tracerWrapper);
  }

  public onStartInvocation(event: any, context: Context) {
    const tracerInitialized = this.tracerWrapper.isTracerAvailable;
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
      spanContext = this.tracerWrapper.extract(rootTraceContext);
      logDebug("Attempting to find parent for datadog trace trace");
    } else {
      logDebug("Didn't attempt to find parent for datadog trace", {
        mergeDatadogXrayTraces: this.config.mergeDatadogXrayTraces,
        traceSource: this.contextService.traceSource,
      });
    }

    const options: TraceOptions = {};
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
      options.childOf = spanContext;
    }
    options.resource = this.handlerName;
    return this.tracerWrapper.wrap("aws.lambda", options, func);
  }
}
