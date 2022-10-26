export type SpanWrapperOptions = {
  isAsync?: boolean;
};

export class SpanWrapper {
  span: any;
  public options: SpanWrapperOptions;

  constructor(span: any, options: SpanWrapperOptions) {
    this.span = span;
    this.options = options;
  }

  public isAsync(): boolean {
    return this.options.isAsync || false;
  }

  public startTime(): number {
    return this.span._startTime;
  }

  public endTime(): number {
    if (this.span._endTime) {
      return this.span._endTime;
    }
    if (this.span._duration && this.span._startTime) {
      return this.span._startTime + this.span._duration;
    }
    throw new Error("_endTime not defined");
  }

  public finish(timestamp = Date.now()): void {
    this.span.finish(timestamp);
  }

  public setTag(tagName: string, val: any): void {
    this.span.setTag(tagName, val);
  }
}
