"use strict";
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.tagObject = void 0;
var redactableKeys = ["authorization", "x-authorization", "password", "token"];
var maxDepth = 10;
function tagObject(currentSpan, key, obj, depth) {
    var e_1, _a;
    if (depth === void 0) { depth = 0; }
    if (depth >= maxDepth) {
        return;
    }
    else {
        depth += 1;
    }
    if (obj === null) {
        return currentSpan.setTag(key, obj);
    }
    if (typeof obj === "string") {
        var parsed = void 0;
        try {
            parsed = JSON.parse(obj);
        }
        catch (e) {
            var redacted = redactVal(key, obj.substring(0, 5000));
            return currentSpan.setTag(key, redacted);
        }
        return tagObject(currentSpan, key, parsed, depth);
    }
    if (typeof obj === "number") {
        return currentSpan.setTag(key, obj);
    }
    if (typeof obj === "object") {
        try {
            for (var _b = __values(Object.entries(obj)), _c = _b.next(); !_c.done; _c = _b.next()) {
                var _d = __read(_c.value, 2), k = _d[0], v = _d[1];
                tagObject(currentSpan, "".concat(key, ".").concat(k), v, depth);
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return;
    }
}
exports.tagObject = tagObject;
function redactVal(k, v) {
    var splitKey = k.split(".").pop() || k;
    if (redactableKeys.includes(splitKey)) {
        return "redacted";
    }
    return v;
}
//# sourceMappingURL=tag-object.js.map