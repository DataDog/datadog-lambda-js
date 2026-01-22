import { SampleMode, TraceContextService, TraceSource } from "./trace-context-service";
import { patchConsole, unpatchConsole } from "./patch-console";
import { SpanContextWrapper } from "./span-context-wrapper";

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
    contextService = new TraceContextService(traceWrapper as any, {} as any);
    contextService["rootTraceContext"] = {
      spanContext: {},
      toTraceId: () => "123456",
      toSpanId: () => "78910",
      sampleMode: () => SampleMode.USER_KEEP,
      source: TraceSource.Event,
    } as SpanContextWrapper;
  });

  afterEach(() => {
    unpatchConsole(cnsole as any);
  });

  it.each([
    { method: "log", mock: () => log },
    { method: "info", mock: () => info },
    { method: "debug", mock: () => debug },
    { method: "error", mock: () => error },
    { method: "warn", mock: () => warn },
    { method: "trace", mock: () => trace },
  ] as const)("injects trace context into $method messages", ({ method, mock }) => {
    patchConsole(cnsole as any, contextService);
    cnsole[method]("Hello");
    expect(mock()).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=78910] Hello");
  });

  it("doesn't inject trace context when none is present", () => {
    contextService["rootTraceContext"] = undefined as any;
    patchConsole(cnsole as any, contextService);
    cnsole.log("Hello");
    expect(log).toHaveBeenCalledWith("Hello");
  });
  it("injects trace context into empty message", () => {
    patchConsole(cnsole as any, contextService);
    cnsole.log();
    expect(log).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=78910]");
  });
  it("injects trace context into JSON-style log by adding dd property", () => {
    patchConsole(cnsole as any, contextService);

    cnsole.log({ objectKey: "objectValue", otherObjectKey: "otherObjectValue" });
    expect(log).toHaveBeenCalledWith({
      objectKey: "objectValue",
      otherObjectKey: "otherObjectValue",
      dd: {
        trace_id: "123456",
        span_id: "78910",
      },
    });
  });

  it.each([
    { name: "array", value: [1, 2, 3], expected: "[dd.trace_id=123456 dd.span_id=78910] 1,2,3" },
    { name: "null", value: null, expected: "[dd.trace_id=123456 dd.span_id=78910] null" },
    { name: "number", value: 42, expected: "[dd.trace_id=123456 dd.span_id=78910] 42" },
    { name: "undefined", value: undefined, expected: "[dd.trace_id=123456 dd.span_id=78910] undefined" },
  ])("injects trace context as string prefix for $name", ({ value, expected }) => {
    patchConsole(cnsole as any, contextService);
    cnsole.log(value);
    expect(log).toHaveBeenCalledWith(expected);
  });

  it("injects trace context as string prefix when multiple arguments provided", () => {
    patchConsole(cnsole as any, contextService);

    cnsole.log({ key: "value" }, "extra arg");
    expect(log).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=78910] [object Object]", "extra arg");
  });

  it("injects trace context as string prefix for class instances", () => {
    patchConsole(cnsole as any, contextService);

    class MyClass {
      value = "test";
    }
    const instance = new MyClass();
    cnsole.log(instance);
    expect(log).toHaveBeenCalledWith("[dd.trace_id=123456 dd.span_id=78910] [object Object]");
  });

  it("injects trace context into JSON-style log created with Object.create(null)", () => {
    patchConsole(cnsole as any, contextService);

    const obj = Object.create(null);
    obj.message = "test";
    cnsole.log(obj);
    expect(log).toHaveBeenCalledWith({
      message: "test",
      dd: {
        trace_id: "123456",
        span_id: "78910",
      },
    });
  });

  it("preserves nested objects in JSON format", () => {
    patchConsole(cnsole as any, contextService);

    cnsole.log({ level: "info", nested: { foo: "bar" } });
    expect(log).toHaveBeenCalledWith({
      level: "info",
      nested: { foo: "bar" },
      dd: {
        trace_id: "123456",
        span_id: "78910",
      },
    });
  });

  it("merges trace context with existing dd property", () => {
    patchConsole(cnsole as any, contextService);

    cnsole.log({ message: "test", dd: { existing: "value" } });
    expect(log).toHaveBeenCalledWith({
      message: "test",
      dd: {
        existing: "value",
        trace_id: "123456",
        span_id: "78910",
      },
    });
  });
  it("leaves empty message unmodified when there is no trace context", () => {
    contextService["rootTraceContext"] = undefined as any;
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
