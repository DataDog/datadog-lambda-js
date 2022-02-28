"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timer = void 0;
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
var Timer = /** @class */ (function () {
    function Timer(intervalMS) {
        this.intervalMS = intervalMS;
        this.isCompleted = false;
    }
    Object.defineProperty(Timer.prototype, "completed", {
        get: function () {
            return this.isCompleted;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Begins the timer. None of the promises will complete until start is called.
     */
    Timer.prototype.start = function () {
        var _this = this;
        if (this.timer !== undefined) {
            return;
        }
        this.timer = setInterval(function () {
            if (_this.currentResolver !== undefined) {
                _this.currentResolver(false);
                _this.currentResolver = undefined;
                _this.currentPromise = undefined;
            }
        }, this.intervalMS);
    };
    /**
     * Gets a promise which will complete when the next interval times out.
     * @returns A promise, which will return true if the timer is complete, or false otherwise.
     */
    Timer.prototype.nextTimeout = function () {
        var _this = this;
        if (this.isCompleted) {
            return new Promise(function (resolve) { return resolve(true); });
        }
        if (this.currentPromise === undefined) {
            this.currentPromise = new Promise(function (resolver) {
                _this.currentResolver = resolver;
            });
        }
        return this.currentPromise;
    };
    /**
     * Completes the timer. This will immediately stop the timer, and complete any pending promises.
     */
    Timer.prototype.complete = function () {
        this.isCompleted = true;
        if (this.timer !== undefined) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        var currentResolver = this.currentResolver;
        this.currentResolver = undefined;
        this.currentPromise = undefined;
        if (currentResolver !== undefined) {
            currentResolver(true);
        }
    };
    return Timer;
}());
exports.Timer = Timer;
//# sourceMappingURL=timer.js.map