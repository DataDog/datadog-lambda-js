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
    return this.span._endTime;
  }

  public finish(timestamp = Date.now()): void {
    this.span.finish(timestamp);
  }

  public setTag(tagName: string, val: any): void {
    this.span.setTag(tagName, val);
  }
}
