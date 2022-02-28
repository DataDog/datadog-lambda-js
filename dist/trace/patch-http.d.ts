import { TraceContextService } from "./trace-context-service";
/**
 * Patches outgoing http calls to include DataDog's tracing headers.
 * @param contextService Provides up to date tracing context.
 */
export declare function patchHttp(contextService: TraceContextService): void;
/**
 * Removes http patching to add DataDog's tracing headers.
 */
export declare function unpatchHttp(): void;
//# sourceMappingURL=patch-http.d.ts.map