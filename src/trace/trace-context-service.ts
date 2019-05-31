import { TraceContext } from "./context";

export class TraceContextService {
  public rootTraceContext?: TraceContext;

  get currentTraceContext(): TraceContext | undefined {
    // TODO Modify root trace context with current subsegment from xray.
    return this.rootTraceContext;
  }
}
