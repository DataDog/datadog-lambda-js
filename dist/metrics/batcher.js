"use strict";
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Batcher = void 0;
/**
 * Batcher joins metrics with matching properties.
 */
var Batcher = /** @class */ (function () {
    function Batcher() {
        this.metrics = new Map();
    }
    /**
     * Add a metric to the batcher
     * @param metric The metric to add
     */
    Batcher.prototype.add = function (metric) {
        var key = this.getBatchKey(metric);
        var result = this.metrics.get(key);
        if (result !== undefined) {
            metric = result.union(metric);
        }
        this.metrics.set(key, metric);
    };
    /**
     * Convert batched metrics to a list of api compatible metrics
     */
    Batcher.prototype.toAPIMetrics = function () {
        return __spreadArray([], __read(this.metrics.values()), false).map(function (metric) { return metric.toAPIMetrics(); }) // No flatMap support yet in node 10
            .reduce(function (prev, curr) { return prev.concat(curr); }, []);
    };
    Batcher.prototype.getBatchKey = function (metric) {
        return JSON.stringify({
            host: metric.host,
            metricType: metric.metricType,
            name: metric.name,
            tags: __spreadArray([], __read(metric.tags), false).sort(),
        });
    };
    return Batcher;
}());
exports.Batcher = Batcher;
//# sourceMappingURL=batcher.js.map