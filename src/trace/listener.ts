import { extractTraceContext } from "./context";
import { patchHttp, unpatchHttp } from "./patch-http";
import { TraceContextService } from "./trace-context-service";
import Tracer, { SpanOptions, TraceOptions, SpanContext } from "dd-trace";
import { Context } from "aws-lambda";

export interface TraceConfig {
  /**
   * Whether to automatically patch all outgoing http requests with Datadog's hybrid tracing headers.
   * @default true.
   */
  autoPatchHTTP: boolean;
}

export class TraceListener {
  private contextService = new TraceContextService();
  private context?: Context;
  private coldstart = true;

  public get currentTraceHeaders() {
    return this.contextService.currentTraceHeaders;
  }

  constructor(private config: TraceConfig, private handlerName: string) {}

  public onStartInvocation(event: any, context: Context) {
    if (this.config.autoPatchHTTP) {
      patchHttp(this.contextService);
    }
    this.context = context;

    this.contextService.rootTraceContext = extractTraceContext(event);
  }

  public async onCompleteInvocation() {
    if (this.config.autoPatchHTTP) {
      unpatchHttp();
    }
    this.coldstart = false;
  }

  public onWrap<T = (...args: any[]) => any>(func: T): T {
    const rootTraceContext = this.contextService.currentTraceHeaders;
    let spanContext: SpanContext | null = Tracer.extract("http_headers", rootTraceContext);
    let options: SpanOptions & TraceOptions = {};
    if (this.context) {
      options.tags = {
        request_id: this.context.awsRequestId,
        function_arn: this.context.invokedFunctionArn,
        resource_names: this.context.functionName,
        cold_start: this.coldstart,
      };
    }

    if (spanContext !== null) {
      options.childOf = spanContext;
    }

    return Tracer.wrap(this.handlerName, options, func);
  }
}
