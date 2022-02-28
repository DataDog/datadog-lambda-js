import { Context, Handler } from "aws-lambda";
export declare type OnWrapFunc<T = (...args: any[]) => any> = (fn: T) => T;
/**
 * Wraps a lambda handler function, adding an onStart and onComplete hook.
 */
export declare function wrap<TEvent, TResult>(handler: Handler<TEvent, TResult>, onStart: (event: TEvent, context: Context) => Promise<void>, onComplete: (event: TEvent, context: Context, error?: Error) => Promise<void>, onWrap?: OnWrapFunc): Handler<TEvent, TResult | undefined>;
export declare function promisifiedHandler<TEvent, TResult>(handler: Handler<TEvent, TResult>): (event: TEvent, context: Context) => Promise<TResult | undefined>;
//# sourceMappingURL=handler.d.ts.map