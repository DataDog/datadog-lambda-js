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
});
