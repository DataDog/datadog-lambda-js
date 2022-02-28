/// <reference types="node" />
import { RequestOptions } from "https";
import { URL } from "url";
declare type RequestResult = {
    success: boolean;
    statusCode?: number;
    errorMessage?: string;
};
export declare function post<T>(url: URL, body: T, options?: Partial<RequestOptions>): Promise<RequestResult>;
export declare function get(url: URL, options?: Partial<RequestOptions>): Promise<RequestResult>;
export {};
//# sourceMappingURL=request.d.ts.map