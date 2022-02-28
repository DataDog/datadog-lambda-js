"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.isDistribution = exports.Distribution = void 0;
var Distribution = /** @class */ (function () {
    function Distribution(name, points) {
        var tags = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            tags[_i - 2] = arguments[_i];
        }
        this.name = name;
        this.points = points;
        this.metricType = "distribution";
        this.tags = tags;
    }
    Distribution.prototype.toAPIMetrics = function () {
        var points = this.points.map(function (point) {
            // Convert the milliseconds we get from getTime to seconds for the Datadog API
            var unixSeconds = Math.floor(point.timestamp.getTime() / 1000);
            return [unixSeconds, [point.value]];
        });
        return [
            {
                metric: this.name,
                points: points,
                tags: this.tags,
                type: this.metricType,
            },
        ];
    };
    Distribution.prototype.union = function (metric) {
        if (!isDistribution(metric)) {
            return this;
        }
        var distribution = new Distribution(this.name, this.points);
        Object.assign(distribution, __assign(__assign({}, this), { points: __spreadArray(__spreadArray([], __read(this.points), false), __read(metric.points), false) }));
        return distribution;
    };
    return Distribution;
}());
exports.Distribution = Distribution;
function isDistribution(metric) {
    return metric.metricType === "distribution";
}
exports.isDistribution = isDistribution;
//# sourceMappingURL=model.js.map