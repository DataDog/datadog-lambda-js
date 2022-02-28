export declare type SpanWrapperOptions = {
    isAsync?: boolean;
};
export declare class SpanWrapper {
    span: any;
    options: SpanWrapperOptions;
    constructor(span: any, options: SpanWrapperOptions);
    isAsync(): boolean;
    startTime(): number;
    endTime(): number;
    finish(timestamp?: number): void;
    setTag(tagName: string, val: any): void;
}
//# sourceMappingURL=span-wrapper.d.ts.map