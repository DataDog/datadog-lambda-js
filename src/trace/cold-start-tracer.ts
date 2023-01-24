import { RequireNode } from "../runtime/require-tracer";
import { SpanWrapper } from "./span-wrapper";
import { TracerWrapper, SpanOptions } from "./tracer-wrapper";

export interface ColdStartTracerConfig {
  tracerWrapper: TracerWrapper;
  parentSpan?: SpanWrapper;
  lambdaFunctionName?: string;
  coldStartSpanFinishTime: number; // Equivalent to the Lambda Span Start Time
  minDuration?: number;
}

export class ColdStartTracer {
  private tracerWrapper: TracerWrapper;
  private parentSpan?: SpanWrapper;
  private lambdaFunctionName?: string;
  private coldStartSpanFinishTime: number;
  private minDuration: number;

  constructor(coldStartTracerConfig: ColdStartTracerConfig) {
    this.tracerWrapper = coldStartTracerConfig.tracerWrapper;
    this.parentSpan = coldStartTracerConfig.parentSpan;
    this.lambdaFunctionName = coldStartTracerConfig.lambdaFunctionName;
    this.coldStartSpanFinishTime = coldStartTracerConfig.coldStartSpanFinishTime;
    this.minDuration = coldStartTracerConfig.minDuration || 3;
  }

  trace(rootNodes: RequireNode[]) {
    const coldStartSpanStartTime = rootNodes[0]?.startTime;
    const coldStartSpan = this.createColdStartSpan(coldStartSpanStartTime, this.parentSpan);
    for (let coldStartNode of rootNodes) {
      this.traceTree(coldStartNode, coldStartSpan);
    }
  }

  private createColdStartSpan(startTime: number, parentSpan: SpanWrapper | undefined): SpanWrapper {
    const options: SpanOptions = {
      tags: {
        service: "aws.lambda",
        operation_name: "aws.lambda.require",
        resource_names: this.lambdaFunctionName,
        "resource.name": this.lambdaFunctionName,
      },
      startTime: startTime,
    };
    if (parentSpan) {
      options.childOf = parentSpan.span;
    }
    const newSpan = new SpanWrapper(this.tracerWrapper.startSpan("aws.lambda.load", options), {});
    newSpan.finish(this.coldStartSpanFinishTime);
    return newSpan;
  }

  private coldStartSpanOperationName(filename: string): string {
    if (filename.startsWith("/opt/")) {
      return "aws.lambda.require_layer";
    } else if (filename.startsWith("/var/runtime/")) {
      return "aws.lambda.require_runtime";
    } else if (filename.includes("/")) {
      return "aws.lambda.require";
    } else {
      return "aws.lambda.require_core_module";
    }
  }

  private traceTree(reqNode: RequireNode, parentSpan: SpanWrapper | undefined): void {
    if (reqNode.endTime - reqNode.startTime < this.minDuration) {
      return;
    }
    const options: SpanOptions = {
      tags: {
        service: "aws.lambda",
        operation_name: this.coldStartSpanOperationName(reqNode.filename),
        resource_names: reqNode.id,
        "resource.name": reqNode.id,
        filename: reqNode.filename,
      },
      startTime: reqNode.startTime,
    };
    if (parentSpan) {
      options.childOf = parentSpan.span;
    }
    const newSpan = new SpanWrapper(
      this.tracerWrapper.startSpan(this.coldStartSpanOperationName(reqNode.filename), options),
      {},
    );
    if (reqNode.endTime - reqNode.startTime > this.minDuration) {
      for (let node of reqNode.children || []) {
        this.traceTree(node, newSpan);
      }
    }
    // TODO move to save memory
    newSpan?.finish(reqNode.endTime);
  }
}
