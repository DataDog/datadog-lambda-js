/// <reference types="node" />
import { TraceContextService } from "./trace-context-service";
/**
 * Patches console output to include DataDog's trace context.
 * @param contextService Provides up to date tracing context.
 */
export declare function patchConsole(cnsle: Console, contextService: TraceContextService): void;
/**
 * Removes log patching to add DataDog's trace context.
 */
export declare function unpatchConsole(cnsle: Console): void;
//# sourceMappingURL=patch-console.d.ts.map