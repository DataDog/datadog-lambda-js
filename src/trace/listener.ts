import { extractTraceContext } from "./context";
import { patchHttp, unpatchHttp } from "./patch-http";
import { TraceContextService } from "./trace-context-service";
import Tracer, { SpanOptions, SpanContext } from "dd-trace";

export interface TraceConfig {
  /**
   * Whether to automatically patch all outgoing http requests with Datadog's hybrid tracing headers.
   * @default true.
   */
  autoPatchHTTP: boolean;
}

export class TraceListener {
  private contextService = new TraceContextService();

  public get currentTraceHeaders() {
    return this.contextService.currentTraceHeaders;
  }

  constructor(private config: TraceConfig) {}

  public onStartInvocation(event: any) {
    if (this.config.autoPatchHTTP) {
      patchHttp(this.contextService);
    }

    this.contextService.rootTraceContext = extractTraceContext(event);
  }

  public async onCompleteInvocation() {
    if (this.config.autoPatchHTTP) {
      unpatchHttp();
    }
  }

  public onWrap<T = (...args: any[]) => any>(func: T): T {
    const rootTraceContext = this.contextService.currentTraceHeaders;
    let spanContext: SpanContext | null = Tracer.extract("http_headers", rootTraceContext);
    let options: SpanOptions = {};
    if (spanContext !== null) {
      options.childOf = spanContext;
    }

    return Tracer.wrap("aws.lambda", options, func);
  }
}
