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
    const lastErrorCall = logger.error.mock.calls[0][0];
    expect(lastErrorCall).toContain('{"status":"error","message":"Oh no!","name":"Error","stack":"Error: Oh no!');
  });
  it("logs errors and metadata correctly", async () => {
    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
    };

    setLogger(logger);
    logError("My Error", { foo: "bar", baz: "2" }, new Error("Oh no 2!"));

    const lastErrorCall = logger.error.mock.calls[0][0];
    expect(lastErrorCall).toContain(
      '{"status":"error","message":"Oh no 2!","foo":"bar","baz":"2","name":"Error","stack":"Error: Oh no 2!',
    );
  });
});
