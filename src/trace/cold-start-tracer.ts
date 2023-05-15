import { RequireNode } from "../runtime/require-tracer";
import { SpanWrapper } from "./span-wrapper";
import { TracerWrapper, SpanOptions } from "./tracer-wrapper";

export interface ColdStartTracerConfig {
  tracerWrapper: TracerWrapper;
  parentSpan?: SpanWrapper;
  lambdaFunctionName?: string;
  currentSpanStartTime: number;
  minDuration: number;
  ignoreLibs: string;
  isColdStart: boolean;
}

export class ColdStartTracer {
  private tracerWrapper: TracerWrapper;
  private parentSpan?: SpanWrapper;
  private lambdaFunctionName?: string;
  private currentSpanStartTime: number;
  private minDuration: number;
  private ignoreLibs: string[];
  private isColdStart: boolean;

  constructor(coldStartTracerConfig: ColdStartTracerConfig) {
    this.tracerWrapper = coldStartTracerConfig.tracerWrapper;
    this.parentSpan = coldStartTracerConfig.parentSpan;
    this.lambdaFunctionName = coldStartTracerConfig.lambdaFunctionName;
    this.currentSpanStartTime = coldStartTracerConfig.currentSpanStartTime;
    this.minDuration = coldStartTracerConfig.minDuration;
    this.ignoreLibs = coldStartTracerConfig.ignoreLibs.split(",");
    this.isColdStart = coldStartTracerConfig.isColdStart;
  }

  trace(rootNodes: RequireNode[]) {
    const coldStartSpanStartTime = rootNodes[0]?.startTime;
    const coldStartSpanEndTime = Math.min(rootNodes[rootNodes.length - 1]?.endTime, this.currentSpanStartTime);
    let targetParentSpan: SpanWrapper | undefined;
    if (this.isColdStart) {
      const coldStartSpan = this.createColdStartSpan(coldStartSpanStartTime, coldStartSpanEndTime, this.parentSpan);
      targetParentSpan = coldStartSpan
    } else {
      targetParentSpan = this.parentSpan
    }
    for (const coldStartNode of rootNodes) {
      this.traceTree(coldStartNode, targetParentSpan);
    }
  }

  private createColdStartSpan(startTime: number, endTime: number, parentSpan: SpanWrapper | undefined): SpanWrapper {
    const options: SpanOptions = {
      tags: {
        service: "aws.lambda",
        operation_name: "aws.lambda.require",
        resource_names: this.lambdaFunctionName,
        "resource.name": this.lambdaFunctionName,
      },
      startTime,
    };
    if (parentSpan) {
      options.childOf = parentSpan.span;
    }
    const newSpan = new SpanWrapper(this.tracerWrapper.startSpan("aws.lambda.load", options), {});
    newSpan.finish(endTime);
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

    if (this.ignoreLibs.includes(reqNode.id)) {
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
      for (const node of reqNode.children || []) {
        this.traceTree(node, newSpan);
      }
    }
    newSpan?.finish(reqNode.endTime);
  }
}
