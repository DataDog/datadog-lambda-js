import { SampleMode, Source } from "./constants";
import { TraceContextService } from "./trace-context-service";
import { patchConsole, unpatchConsole } from "./patch-console";

describe("patchConsole", () => {
  let traceWrapper = {
    isTracerAvailable: false,
    extract: () => null,
    wrap: (fn: any) => fn,
    traceContext: () => undefined,
  };

  let contextService: TraceContextService;
  let cnsole: Console;
  let log: jest.Mock<any, any>;
  let info: jest.Mock<any, any>;
  let debug: jest.Mock<any, any>;
  let error: jest.Mock<any, any>;
  let warn: jest.Mock<any, any>;
  let trace: jest.Mock<any, any>;

  beforeEach(() => {
    log = jest.fn();
    info = jest.fn();
    debug = jest.fn();
    error = jest.fn();
    warn = jest.fn();
    trace = jest.fn();
    cnsole = { log, info, debug, error, warn, trace } as any;
    contextService = new TraceContextService(traceWrapper as any);
    contextService["rootTraceContext"] = {
      parentID: "78910",
      sampleMode: SampleMode.USER_KEEP,
      source: Source.Event,
      traceID: "123456",
    };
  });

  afterEach(() => {
    unpatchConsole(cnsole as any);
  });

  it("injects trace context into log messages", () => {
    patchConsole(cnsole as any, contextService);
    cnsole.log("Hello");
    expect(log).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=78910] Hello");
  });
  it("injects trace context into debug messages", () => {
    patchConsole(cnsole as any, contextService);
    cnsole.info("Hello");
    expect(info).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=78910] Hello");
  });
  it("injects trace context into debug messages", () => {
    patchConsole(cnsole as any, contextService);
    cnsole.debug("Hello");
    expect(debug).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=78910] Hello");
  });
  it("injects trace context into error messages", () => {
    patchConsole(cnsole as any, contextService);
    cnsole.error("Hello");
    expect(error).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=78910] Hello");
  });
  it("injects trace context into error messages", () => {
    patchConsole(cnsole as any, contextService);
    cnsole.warn("Hello");
    expect(warn).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=78910] Hello");
  });
  it("injects trace context into error messages", () => {
    patchConsole(cnsole as any, contextService);
    cnsole.trace("Hello");
    expect(trace).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=78910] Hello");
  });

  it("doesn't inject trace context when none is present", () => {
    contextService["rootTraceContext"] = undefined;
    patchConsole(cnsole as any, contextService);
    cnsole.log("Hello");
    expect(log).toHaveBeenCalledWith("Hello");
  });
  it("injects trace context into empty message", () => {
    patchConsole(cnsole as any, contextService);
    cnsole.log();
    expect(log).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=78910]");
  });
  it("injects trace context into logged object message", () => {
    patchConsole(cnsole as any, contextService);

    cnsole.log({ objectKey: "objectValue", otherObjectKey: "otherObjectValue" });
    expect(log).toHaveBeenCalledWith(
      "[dd.trace_id=123456 dd.span_id=78910] { objectKey: 'objectValue', otherObjectKey: 'otherObjectValue' }",
    );
  });
  it("leaves empty message unmodified when there is no trace context", () => {
    contextService["rootTraceContext"] = undefined;
    patchConsole(cnsole as any, contextService);
    cnsole.log();
    expect(log).toHaveBeenCalledWith();
  });
  it("leaves unpatched console objects unmodified", () => {
    const originalLog = cnsole.log;
    unpatchConsole(cnsole);
    expect(cnsole.log).toEqual(originalLog);
  });
  it("modifies patched console objects", () => {
    patchConsole(cnsole, contextService);
    const originalLog = cnsole.log;
    unpatchConsole(cnsole);
    expect(cnsole.log).not.toEqual(originalLog);
  });
});
