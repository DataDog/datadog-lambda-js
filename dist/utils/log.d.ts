export declare enum LogLevel {
    DEBUG = 0,
    ERROR = 1,
    NONE = 2
}
export interface Logger {
    debug(message: string): void;
    error(message: string): void;
}
export declare function setLogger(customLogger: Logger): void;
export declare function setLogLevel(level: LogLevel): void;
export declare function getLogLevel(): LogLevel;
export declare function logDebug(message: string, metadata?: Error | object, error?: Error): void;
export declare function logError(message: string, metadata?: Error | object, error?: Error): void;
//# sourceMappingURL=log.d.ts.map