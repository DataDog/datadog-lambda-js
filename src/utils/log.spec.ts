import { setLogger, logError } from "./log";

describe("logger", () => {
  it("log using custom logger", async () => {
    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
    };

    setLogger(logger);
    logError("My Error");

    expect(logger.error).toHaveBeenLastCalledWith('{"status":"error","message":"datadog:My Error"}');
  });
  it("logs errors correctly", async () => {
    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
    };

    setLogger(logger);
    logError("My Error", new Error("Oh no!"));

    expect(logger.error).toHaveBeenLastCalledWith('{"status":"error","message":"datadog:My Error"}');
  });
  it("logs errors and metadata correctly", async () => {
    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
    };

    setLogger(logger);
    logError("My Error", { foo: "bar", baz: "2" }, new Error("Oh no 2!"));

    expect(logger.error).toHaveBeenLastCalledWith('{"status":"error","message":"datadog:My Error"}');
  });
});
