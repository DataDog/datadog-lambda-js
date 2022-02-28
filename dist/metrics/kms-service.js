"use strict";
// In order to avoid the layer adding the 40mb aws-sdk to a deployment, (which is always available
// in the Lambda environment anyway), we use require to import the SDK.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KMSService = void 0;
var utils_1 = require("../utils");
var KMSService = /** @class */ (function () {
    function KMSService() {
    }
    KMSService.prototype.decrypt = function (ciphertext) {
        var _a;
        return __awaiter(this, void 0, void 0, function () {
            var kms, kmsClient, buffer, result, _b, encryptionContext, err_1, errorMsg;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 6, , 7]);
                        kms = require("aws-sdk/clients/kms");
                        kmsClient = new kms();
                        buffer = Buffer.from(ciphertext, "base64");
                        result = void 0;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 5]);
                        return [4 /*yield*/, kmsClient.decrypt({ CiphertextBlob: buffer }).promise()];
                    case 2:
                        result = _c.sent();
                        return [3 /*break*/, 5];
                    case 3:
                        _b = _c.sent();
                        encryptionContext = { LambdaFunctionName: (_a = process.env.AWS_LAMBDA_FUNCTION_NAME) !== null && _a !== void 0 ? _a : "" };
                        return [4 /*yield*/, kmsClient.decrypt({ CiphertextBlob: buffer, EncryptionContext: encryptionContext }).promise()];
                    case 4:
                        result = _c.sent();
                        return [3 /*break*/, 5];
                    case 5:
                        if (result.Plaintext === undefined) {
                            throw Error();
                        }
                        return [2 /*return*/, result.Plaintext.toString("ascii")];
                    case 6:
                        err_1 = _c.sent();
                        if (err_1.code === "MODULE_NOT_FOUND") {
                            errorMsg = "optional dependency aws-sdk not installed. KMS key decryption will not work";
                            (0, utils_1.logError)(errorMsg);
                            throw Error(errorMsg);
                        }
                        throw Error("Couldn't decrypt ciphertext");
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    return KMSService;
}());
exports.KMSService = KMSService;
//# sourceMappingURL=kms-service.js.map