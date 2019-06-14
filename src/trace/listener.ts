import { extractTraceContext } from "./context";
import { patchHttp, unpatchHttp } from "./patch-http";
import { TraceContextService } from "./trace-context-service";

export interface TraceConfig {
  /**
   * Whether to automatically patch all outgoing http requests with Datadog's hybrid tracing headers.
   * @default true.
   */
  autoPatchHTTP: boolean;
}

export class TraceListener {
  constructor(private config: TraceConfig) {}

  public onStartInvocation(event: any) {
    const contextService = new TraceContextService();
    if (this.config.autoPatchHTTP) {
      patchHttp(contextService);
    }
    contextService.rootTraceContext = extractTraceContext(event);
  }

  public async onCompleteInvocation() {
    if (this.config.autoPatchHTTP) {
      unpatchHttp();
    }
  }
}
