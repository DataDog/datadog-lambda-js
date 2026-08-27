import fs from "fs";

import { clearTraceTree, getTraceTree } from "./require-tracer";
import { load } from "./user-function";

const mockImport = jest.fn();

jest.mock("./module_importer", () => ({
  import: (...args: any[]) => mockImport(...args),
}));

describe("user-function", () => {
  let existsSyncSpy: jest.SpyInstance;

  beforeEach(() => {
    clearTraceTree();
    mockImport.mockReset();
    existsSyncSpy = jest.spyOn(fs, "existsSync").mockImplementation((filePath) => {
      return String(filePath) === "/var/task/index.mjs";
    });
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
    clearTraceTree();
  });

  it("records ESM handler imports with real measured duration", async () => {
    const handler = jest.fn();
    mockImport.mockResolvedValue({ handler });

    const loadedHandler = await load("/var/task", "index.handler");

    expect(loadedHandler).toBe(handler);
    expect(mockImport).toHaveBeenCalledWith("/var/task/index.mjs");
    const traceTree = getTraceTree();
    expect(traceTree).toHaveLength(1);
    expect(traceTree[0].id).toBe("/var/task/index.mjs");
    expect(traceTree[0].filename).toBe("/var/task/index.mjs");
    expect(traceTree[0].kind).toBe("import");
    expect(traceTree[0].endTime).toBeGreaterThanOrEqual(traceTree[0].startTime);
  });
});
