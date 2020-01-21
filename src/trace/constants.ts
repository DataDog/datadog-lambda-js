export enum SampleMode {
  USER_REJECT = -1,
  AUTO_REJECT = 0,
  AUTO_KEEP = 1,
  USER_KEEP = 2,
}
export enum Source {
  Xray = "xray",
  Event = "event",
}

export const traceIDHeader = "x-datadog-trace-id";
export const parentIDHeader = "x-datadog-parent-id";
export const samplingPriorityHeader = "x-datadog-sampling-priority";
export const xraySubsegmentName = "datadog-metadata";
export const xraySubsegmentKey = "trace";
export const xrayBaggageSubsegmentKey = "root_span_metadata";
export const xraySubsegmentNamespace = "datadog";
export const xrayTraceEnvVar = "_X_AMZN_TRACE_ID";
