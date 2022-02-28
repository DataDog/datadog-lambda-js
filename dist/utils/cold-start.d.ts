/**
 * Use global variables to determine whether the container cold started
 * On the first container run, isColdStartSet and functionDidColdStart are true
 * For subsequent executions isColdStartSet will be true and functionDidColdStart will be false
 */
export declare function setColdStart(): void;
export declare function didFunctionColdStart(): boolean;
export declare function getColdStartTag(): string;
export declare function _resetColdStart(): void;
//# sourceMappingURL=cold-start.d.ts.map