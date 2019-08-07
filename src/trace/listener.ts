import { extractTraceContext } from "./context";
import { patchHttp, unpatchHttp } from "./patch-http";
import { TraceContextService } from "./trace-context-service";
import Tracer from "dd-trace";
import { SpanContext, Span } from "dd-trace";

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
     * Whether to us native datadog tracing with dd-trace-js.
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
    if (this.config.autoPatchHTTP) {
      patchHttp(this.contextService);
    }

    const rootTraceContext = extractTraceContext(event);
    this.contextService.rootTraceContext = rootTraceContext;

    let rootContext: SpanContext | undefined;
    if (rootTraceContext) {
      rootContext = {
        toSpanId: () => rootTraceContext.parentID,
        toTraceId: () => rootTraceContext.traceID,
      };
    }

    this.rootSpan = Tracer.startSpan("aws.lambda", { childOf: rootContext });
    this.rootSpan.inject();
  }

  public async onCompleteInvocation() {
    if (this.rootSpan !== undefined) {
      this.rootSpan.finish();
    }
    this.rootSpan = undefined;

    if (this.config.autoPatchHTTP) {
      unpatchHttp();
    }
  }
}
