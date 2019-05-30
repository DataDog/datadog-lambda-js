export enum SampleMode {
  USER_REJECT = -1,
  AUTO_REJECT = 0,
  AUTO_KEEP = 1,
  USER_KEEP = 2,
}
export const traceHeaderPrefix = "X-Amzn-Trace-Id:";
export const traceIDTag = "Root";
export const parentIDTag = "Parent";
export const sampledTag = "Sampled";
export const traceIDHeader = "x-datadog-trace-id";
export const parentIDHeader = "x-datadog-parent-id";
export const samplingPriorityHeader = "x-datadog-sampling-priority";
export const traceEnvVar = "_X_AMZN_TRACE_ID";
