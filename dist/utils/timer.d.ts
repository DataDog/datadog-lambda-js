/**
 * Timer is used to get a promise that completes at a regular interval.
 * ```typescript
 * const intervalMS = 100;
 * const timer = new Timer(intervalMS);
 * timer.start();
 * await timer.nextTimeout(); // Called in 100 ms
 * await timer.nextTimeout(); // Called in another 100 ms
 * timer.complete(); // Complete all pending timeout and cancels the timer.
 * ```
 */
export declare class Timer {
    private intervalMS;
    private timer?;
    private currentPromise?;
    private currentResolver?;
    private isCompleted;
    get completed(): boolean;
    constructor(intervalMS: number);
    /**
     * Begins the timer. None of the promises will complete until start is called.
     */
    start(): void;
    /**
     * Gets a promise which will complete when the next interval times out.
     * @returns A promise, which will return true if the timer is complete, or false otherwise.
     */
    nextTimeout(): Promise<boolean>;
    /**
     * Completes the timer. This will immediately stop the timer, and complete any pending promises.
     */
    complete(): void;
}
//# sourceMappingURL=timer.d.ts.map