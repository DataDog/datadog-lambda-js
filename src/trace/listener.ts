import { extractTraceContext } from "./context";
import { patchHttp, unpatchHttp } from "./patch-http";
import { TraceContextService } from "./trace-context-service";
import Tracer from "dd-trace";
import { SpanContext, Span } from "dd-trace";
import { OnWrapFunc } from "utils/handler";

export interface TraceConfig {
  /**
   * Whether to automatically patch all outgoing http requests with Datadog's hybrid tracing headers.
   * @default true.
   */
  autoPatchHTTP: boolean;
  /**
   * Experimental features. These may break at any time.
   */
  experimental: {
    /**
     * Whether to use native datadog tracing with dd-trace-js.
     */
    enableDatadogTracing: boolean;
  };
}

export class TraceListener {
  private contextService = new TraceContextService();
  private rootSpan?: Span;

  public get currentTraceHeaders() {
    return this.contextService.currentTraceHeaders;
  }

  constructor(private config: TraceConfig) {
    if (config.experimental.enableDatadogTracing) {
      Tracer.init({
        experimental: {
          useLogTraceExporter: true,
        },
      });
    }
  }

  public onStartInvocation(event: any) {
    if (this.config.autoPatchHTTP && !this.config.experimental.enableDatadogTracing) {
      patchHttp(this.contextService);
    }

    this.contextService.rootTraceContext = extractTraceContext(event);
  }

  public async onCompleteInvocation() {
    if (this.config.autoPatchHTTP && !this.config.experimental.enableDatadogTracing) {
      unpatchHttp();
    }
  }

  public onWrap<T = (...args: any[]) => any>(func: T): T {
    const rootTraceContext = this.contextService.rootTraceContext;
    let spanContext: SpanContext | undefined;
    if (rootTraceContext) {
      spanContext = {
        toSpanId: () => rootTraceContext.parentID,
        toTraceId: () => rootTraceContext.traceID,
      };
    }
    //const startSpan = Tracer.startSpan("aws.lambda", { childOf: spanContext });

    //return Tracer.scope().activate(startSpan, func as any) as T;
    return Tracer.wrap("aws.lambda", { childOf: spanContext }, func);
  }
}
