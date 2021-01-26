import { Context } from "aws-lambda";

import { TraceContext, extractTraceContext, readStepFunctionContextFromEvent, StepFunctionContext } from "./context";
import { patchHttp, unpatchHttp } from "./patch-http";
import { TraceContextService } from "./trace-context-service";

import { logDebug } from "../utils";
import { didFunctionColdStart } from "../utils/cold-start";
import { datadogLambdaVersion } from "../constants";
import { Source, ddtraceVersion } from "./constants";
import { patchConsole } from "./patch-console";
import { SpanContext, TraceOptions, TracerWrapper } from "./tracer-wrapper";

export type TraceExtractor = (event: any, context: Context) => TraceContext;

export interface TraceConfig {
  /**
   * Whether to automatically patch all outgoing http requests with Datadog's hybrid tracing headers.
   * @default true.
   */
  autoPatchHTTP: boolean;
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
    if (this.config.injectLogContext) {
      patchConsole(console, this.contextService);
      logDebug("Patched console output with trace context");
    } else {
      logDebug("Didn't patch console output with trace context");
    }

    // If the DD tracer is initialized then it's doing http patching so we don't again here
    if (this.config.autoPatchHTTP && !tracerInitialized) {
      logDebug("Patching HTTP libraries");
      patchHttp(this.contextService);
    } else {
      logDebug("Not patching HTTP libraries", { autoPatchHTTP: this.config.autoPatchHTTP, tracerInitialized });
    }

    this.context = context;
    this.contextService.rootTraceContext = extractTraceContext(event, context, this.config.traceExtractor);
    this.stepFunctionContext = readStepFunctionContextFromEvent(event);
  }

  public async onCompleteInvocation() {
    // If the DD tracer is initialized it manages patching of the http lib on its own
    const tracerInitialized = this.tracerWrapper.isTracerAvailable;
    if (this.config.autoPatchHTTP && !tracerInitialized) {
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
      const functionArn = (this.context.invokedFunctionArn ?? "").toLowerCase();
      const tk = functionArn.split(":");
      options.tags = {
        cold_start: didFunctionColdStart(),
        function_arn: tk.length > 7 ? tk.slice(0, 7).join(":") : functionArn,
        function_version: tk.length > 7 ? tk[7] : "$LATEST",
        request_id: this.context.awsRequestId,
        resource_names: this.context.functionName,
        datadog_lambda: datadogLambdaVersion,
        dd_trace: ddtraceVersion,
      };
      if (
        (this.contextService.traceSource === Source.Xray && this.config.mergeDatadogXrayTraces) ||
        this.contextService.traceSource === Source.Event
      ) {
        options.tags["_dd.parent_source"] = this.contextService.traceSource;
      }
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
    options.type = "serverless";
    options.service = "aws.lambda";
    if (this.context) {
      options.resource = this.context.functionName;
    }

    return this.tracerWrapper.wrap("aws.lambda", options, func);
  }
}
