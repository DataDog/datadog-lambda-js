import { Context } from "aws-lambda";

import {
  addLambdaFunctionTagsToXray,
  TraceContext,
  readStepFunctionContextFromEvent,
  StepFunctionContext,
} from "./context";
import { patchHttp, unpatchHttp } from "./patch-http";
import { TraceContextService } from "./trace-context-service";
import { extractTriggerTags, extractHTTPStatusCodeTag } from "./trigger";

import { logDebug, tagObject } from "../utils";
import { didFunctionColdStart } from "../utils/cold-start";
import { datadogLambdaVersion } from "../constants";
import { Source, ddtraceVersion } from "./constants";
import { patchConsole } from "./patch-console";
import { SpanContext, TraceOptions, TracerWrapper } from "./tracer-wrapper";
import { SpanInferrer } from "./span-inferrer";
import { SpanWrapper } from "./span-wrapper";
export type TraceExtractor = (event: any, context: Context) => TraceContext;

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

export class TraceListener {
  private contextService: TraceContextService;
  private context?: Context;
  private stepFunctionContext?: StepFunctionContext;
  private tracerWrapper: TracerWrapper;
  private inferrer: SpanInferrer;
  private inferredSpan?: SpanWrapper;
  private wrappedCurrentSpan?: SpanWrapper;
  private triggerTags?: { [key: string]: string };
  private lambdaSpanParentContext?: SpanContext;

  public get currentTraceHeaders() {
    return this.contextService.currentTraceHeaders;
  }

  constructor(private config: TraceConfig) {
    this.tracerWrapper = new TracerWrapper();
    this.contextService = new TraceContextService(this.tracerWrapper);
    this.inferrer = new SpanInferrer(this.tracerWrapper);
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
    const rootTraceHeaders = this.contextService.extractHeadersFromContext(event, context, this.config.traceExtractor);
    // The aws.lambda span needs to have a parented to the Datadog trace context from the
    // incoming event if available or the X-Ray trace context if hybrid tracing is enabled
    let parentSpanContext: SpanContext | undefined;
    if (this.contextService.traceSource === Source.Event || this.config.mergeDatadogXrayTraces) {
      parentSpanContext = rootTraceHeaders ? this.tracerWrapper.extract(rootTraceHeaders) ?? undefined : undefined;
      logDebug("Attempting to find parent for the aws.lambda span");
    } else {
      logDebug("Didn't attempt to find parent for aws.lambda span", {
        mergeDatadogXrayTraces: this.config.mergeDatadogXrayTraces,
        traceSource: this.contextService.traceSource,
      });
    }
    if (this.config.createInferredSpan) {
      this.inferredSpan = this.inferrer.createInferredSpan(event, context, parentSpanContext);
    }
    this.lambdaSpanParentContext = this.inferredSpan?.span || parentSpanContext;
    this.context = context;
    this.triggerTags = extractTriggerTags(event, context);
    this.stepFunctionContext = readStepFunctionContextFromEvent(event);
  }

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
  public onEndingInvocation(event: any, result: any, shouldTagPayload = false) {
    // Guard clause if something has gone horribly wrong
    // so we won't crash user code.
    if (!this.tracerWrapper.currentSpan) return;

    this.wrappedCurrentSpan = new SpanWrapper(this.tracerWrapper.currentSpan, {});
    if (shouldTagPayload) {
      tagObject(this.tracerWrapper.currentSpan, "function.request", event);
      tagObject(this.tracerWrapper.currentSpan, "function.response", result);
    }

    if (this.triggerTags) {
      const statusCode = extractHTTPStatusCodeTag(this.triggerTags, result);
      // Store the status tag in the listener to send to Xray on invocation completion
      this.triggerTags["http.status_code"] = statusCode!;
      if (this.tracerWrapper.currentSpan) {
        this.tracerWrapper.currentSpan.setTag("http.status_code", statusCode);
      }
      if (this.inferredSpan) {
        this.inferredSpan.setTag("http.status_code", statusCode);
      }
    }
  }

  public async onCompleteInvocation() {
    // Create a new dummy Datadog subsegment for function trigger tags so we
    // can attach them to X-Ray spans when hybrid tracing is used
    if (this.triggerTags) {
      addLambdaFunctionTagsToXray(this.triggerTags);
    }
    // If the DD tracer is initialized it manages patching of the http lib on its own
    const tracerInitialized = this.tracerWrapper.isTracerAvailable;
    if (this.config.autoPatchHTTP && !tracerInitialized) {
      logDebug("Unpatching HTTP libraries");
      unpatchHttp();
    }
    if (this.inferredSpan) {
      logDebug("Finishing inferred span");
      const finishTime = this.inferredSpan.isAsync() ? this.wrappedCurrentSpan?.startTime() : Date.now();
      this.inferredSpan.finish(finishTime);
    }
  }

  public onWrap<T = (...args: any[]) => any>(func: T): T {
    const options: TraceOptions = {};
    if (this.context) {
      logDebug("Creating the aws.lambda span");
      const functionArn = (this.context.invokedFunctionArn ?? "").toLowerCase();
      const tk = functionArn.split(":");
      options.tags = {
        cold_start: didFunctionColdStart(),
        function_arn: tk.length > 7 ? tk.slice(0, 7).join(":") : functionArn,
        function_version: tk.length > 7 ? tk[7] : "$LATEST",
        request_id: this.context.awsRequestId,
        resource_names: this.context.functionName,
        functionname: this.context?.functionName?.toLowerCase(),
        datadog_lambda: datadogLambdaVersion,
        dd_trace: ddtraceVersion,
      };
      if (
        (this.contextService.traceSource === Source.Xray && this.config.mergeDatadogXrayTraces) ||
        this.contextService.traceSource === Source.Event
      ) {
        options.tags["_dd.parent_source"] = this.contextService.traceSource;
      }
      if (this.triggerTags) {
        options.tags = { ...options.tags, ...this.triggerTags };
      }
    }
    if (this.stepFunctionContext) {
      logDebug("Applying step function context to the aws.lambda span");
      options.tags = {
        ...options.tags,
        ...this.stepFunctionContext,
      };
    }
    if (this.lambdaSpanParentContext) {
      options.childOf = this.lambdaSpanParentContext;
    }
    options.type = "serverless";
    options.service = "aws.lambda";
    if (this.context) {
      options.resource = this.context.functionName;
    }
    return this.tracerWrapper.wrap("aws.lambda", options, func);
  }
}
