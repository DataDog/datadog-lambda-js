import { Context } from "aws-lambda";
import { TraceConfig } from "../listener";
import { logDebug, logError } from "../../utils";
import { XrayService } from "../xray-service";
import {
  AppSyncEventTraceExtractor,
  CustomTraceExtractor,
  EventBridgeEventTraceExtractor,
  EventBridgeSNSEventTraceExtractor,
  EventBridgeSQSEventTraceExtractor,
  HTTPEventTraceExtractor,
  KinesisEventTraceExtractor,
  LambdaContextTraceExtractor,
  SNSEventTraceExtractor,
  SNSSQSEventTraceExtractor,
  SQSEventTraceExtractor,
  StepFunctionEventTraceExtractor,
} from "./extractors";
import { StepFunctionContextService } from "../step-function-service";
import { EventValidator } from "../../utils/event-validator";
import { TracerWrapper } from "../tracer-wrapper";
import { SpanContextWrapper } from "../span-context-wrapper";

export const DATADOG_TRACE_ID_HEADER = "x-datadog-trace-id";
export const DATADOG_PARENT_ID_HEADER = "x-datadog-parent-id";
export const DATADOG_SAMPLING_PRIORITY_HEADER = "x-datadog-sampling-priority";

export interface EventTraceExtractor {
  extract(event: any): SpanContextWrapper | null;
}

export interface DatadogTraceHeaders {
  [DATADOG_TRACE_ID_HEADER]: string;
  [DATADOG_PARENT_ID_HEADER]: string;
  [DATADOG_SAMPLING_PRIORITY_HEADER]: string;
}

export class TraceContextExtractor {
  private xrayService: XrayService;
  private stepFunctionContextService?: StepFunctionContextService;

  constructor(private tracerWrapper: TracerWrapper, private config: TraceConfig) {
    this.xrayService = new XrayService();
  }

  async extract(event: any, context: Context): Promise<SpanContextWrapper | null> {
    this.stepFunctionContextService = StepFunctionContextService.instance(event);

    let spanContext: SpanContextWrapper | null = null;
    if (this.config.traceExtractor) {
      const customExtractor = new CustomTraceExtractor(this.config.traceExtractor);
      spanContext = await customExtractor.extract(event, context);
    }

    if (spanContext === null) {
      const eventExtractor = this.getTraceEventExtractor(event);
      if (eventExtractor !== undefined) {
        spanContext = eventExtractor.extract(event);
      }
    }

    if (spanContext === null) {
      const contextExtractor = new LambdaContextTraceExtractor(this.tracerWrapper);
      spanContext = contextExtractor.extract(context);
    }

    if (spanContext !== null) {
      this.addTraceContextToXray(spanContext);

      return spanContext;
    }

    return this.xrayService.extract();
  }

  private getTraceEventExtractor(event: any): EventTraceExtractor | undefined {
    if (!event || typeof event !== "object") return;

    const headers = event.headers ?? event.multiValueHeaders;
    if (headers !== null && typeof headers === "object") {
      return new HTTPEventTraceExtractor(this.tracerWrapper, this.config.decodeAuthorizerContext);
    }

    if (EventValidator.isEventBridgeSNSEvent(event)) return new EventBridgeSNSEventTraceExtractor(this.tracerWrapper);
    if (EventValidator.isSNSEvent(event)) return new SNSEventTraceExtractor(this.tracerWrapper);
    if (EventValidator.isSNSSQSEvent(event)) return new SNSSQSEventTraceExtractor(this.tracerWrapper);
    if (EventValidator.isEventBridgeSQSEvent(event)) return new EventBridgeSQSEventTraceExtractor(this.tracerWrapper);
    if (EventValidator.isAppSyncResolverEvent(event)) return new AppSyncEventTraceExtractor(this.tracerWrapper);
    if (EventValidator.isSQSEvent(event)) return new SQSEventTraceExtractor(this.tracerWrapper);
    if (EventValidator.isKinesisStreamEvent(event)) return new KinesisEventTraceExtractor(this.tracerWrapper);
    if (EventValidator.isEventBridgeEvent(event)) return new EventBridgeEventTraceExtractor(this.tracerWrapper);

    if (this.stepFunctionContextService?.context) return new StepFunctionEventTraceExtractor();

    return;
  }

  private addTraceContextToXray(spanContext: SpanContextWrapper) {
    try {
      if (this.stepFunctionContextService?.context !== undefined) {
        this.xrayService.addStepFunctionContext(this.stepFunctionContextService.context);
        logDebug(`Added Step Function metadata to Xray metadata`, { trace: spanContext });
        return;
      }

      const metadata = {
        "trace-id": spanContext.toTraceId(),
        "parent-id": spanContext.toSpanId(),
        "sampling-priority": spanContext.sampleMode(),
      };
      this.xrayService.addMetadata(metadata);

      logDebug(`Added trace context to Xray metadata`, { trace: spanContext });
    } catch (error) {
      if (error instanceof Error) {
        if (this.stepFunctionContextService?.context !== undefined) {
          logError("Couldn't add Step Function metadata to Xray", error);
          return;
        }

        logError("Couldn't add trace context to xray metadata", error);
      }
    }
  }
}
