"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpanWrapper = void 0;
var SpanWrapper = /** @class */ (function () {
    function SpanWrapper(span, options) {
        this.span = span;
        this.options = options;
    }
    SpanWrapper.prototype.isAsync = function () {
        return this.options.isAsync || false;
    };
    SpanWrapper.prototype.startTime = function () {
        return this.span._startTime;
    };
    SpanWrapper.prototype.endTime = function () {
        return this.span._endTime;
    };
    SpanWrapper.prototype.finish = function (timestamp) {
        if (timestamp === void 0) { timestamp = Date.now(); }
        this.span.finish(timestamp);
    };
    SpanWrapper.prototype.setTag = function (tagName, val) {
        this.span.setTag(tagName, val);
    };
    return SpanWrapper;
}());
exports.SpanWrapper = SpanWrapper;
//# sourceMappingURL=span-wrapper.js.map