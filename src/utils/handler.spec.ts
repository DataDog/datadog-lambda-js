import { Context, Handler } from "aws-lambda";

import { didFunctionColdStart } from "./cold-start";
import { promisifiedHandler } from "./handler";
import { LogLevel, setLogLevel } from "./log";

const mockContext = {
  invokedFunctionArn: "arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda",
} as any as Context;

beforeEach(() => {
  setLogLevel(LogLevel.NONE);
});

describe("promisifiedHandler", () => {
  it("returns a promise when callback used by the handler", async () => {
    const handler: Handler = (event, context, callback) => {
      callback(null, { statusCode: 200, body: "The body of the response" });
    };

    const promHandler = promisifiedHandler(handler) as any;

    const result = await promHandler({}, mockContext);
    expect(result).toEqual({ statusCode: 200, body: "The body of the response" });
  });

  it("returns a promise when the original handler returns a promise", async () => {
    const handler: Handler = async (event, context, callback) => {
      return { statusCode: 200, body: "The body of the response" };
    };

    const promHandler = promisifiedHandler(handler) as any;

    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 200, body: "The body of the response" });
  });

  it("throws an error when the original lambda gives the callback an error", async () => {
    const handler: Handler = (event, context, callback) => {
      return callback(new Error("Some error"), { statusCode: 200, body: "The body of the response" });
    };

    const promHandler = promisifiedHandler(handler) as any;

    const result = promHandler({}, mockContext);

    await expect(result).rejects.toEqual(new Error("Some error"));
  });

  it("throws an error when the original lambda throws an error", async () => {
    const handler: Handler = async (event, context, callback) => {
      throw Error("Some error");
    };

    const promHandler = promisifiedHandler(handler) as any;

    const result = promHandler({}, mockContext);
    await expect(result).rejects.toEqual(Error("Some error"));
  });

  it("returns the first result to complete between the callback and the handler promise", async () => {
    const handler: Handler = async (event, context, callback) => {
      callback(null, { statusCode: 204, body: "The callback response" });
      return { statusCode: 200, body: "The promise response" };
    };

    const promHandler = promisifiedHandler(handler) as any;

    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 204, body: "The callback response" });
  });

  it("doesn't complete using non-promise return values", async () => {
    const handler: Handler = (event, context, callback) => {
      setTimeout(() => {
        callback(null, { statusCode: 204, body: "The callback response" });
      }, 10);
      return { statusCode: 200, body: "The promise response" } as unknown as void;
    };

    const promHandler = promisifiedHandler(handler) as any;

    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 204, body: "The callback response" });
  });

  it("completes when calling context.done", async () => {
    const handler: Handler = async (event, context, callback) => {
      context.done(undefined, { statusCode: 204, body: "The callback response" });
    };

    const promHandler = promisifiedHandler(handler) as any;

    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 204, body: "The callback response" });
  });
  it("completes when calling context.succeed", async () => {
    const handler: Handler = async (event, context, callback) => {
      context.succeed({ statusCode: 204, body: "The callback response" });
    };

    const promHandler = promisifiedHandler(handler) as any;

    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 204, body: "The callback response" });
  });

  it("throws error when calling context.fail", async () => {
    const handler: Handler = async (event, context, callback) => {
      context.fail(new Error("Some error"));
    };

    const promHandler = promisifiedHandler(handler) as any;

    const result = promHandler({}, mockContext);

    await expect(result).rejects.toEqual(new Error("Some error"));
  });

  it("completes when handler returns undefined", async () => {
    const handler: Handler = (event, context) => {
      // No return statement, implicitly returns undefined
    };

    const promHandler = promisifiedHandler(handler) as any;

    const result = await promHandler({}, mockContext);

    expect(result).toEqual(undefined);
  });

  it("completes when handler returns a value directly (sync handler)", async () => {
    const handler = (event: any, context: Context) => {
      // Return a value directly without using callback or promise
      return { statusCode: 200, body: "Sync response" };
    };

    const promHandler = promisifiedHandler(handler as any) as any;

    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 200, body: "Sync response" });
  });

  it("waits for callback when handler returns non-promise artifact with callback parameter", async () => {
    // Simulates aws-serverless-express pattern where a server instance is returned
    // but the actual response comes through the callback
    const serverArtifact = { type: "server-instance", listen: () => {} };
    const handler: Handler = (event, context, callback) => {
      // Simulate async processing that eventually calls callback
      setTimeout(() => {
        callback(null, { statusCode: 200, body: "Actual response from callback" });
      }, 10);
      return serverArtifact as unknown as void;
    };

    const promHandler = promisifiedHandler(handler) as any;

    const result = await promHandler({}, mockContext);

    // Should return the callback result, not the server artifact
    expect(result).toEqual({ statusCode: 200, body: "Actual response from callback" });
    expect(result).not.toBe(serverArtifact);
  });

  it("should wait for context.done in legacy mode when handler returns artifact (2 params)", async () => {
    // In legacy mode, handlers with only 2 parameters (event, context) return side-effect artifacts
    // like aws-serverless-express server and rely on context.done to finish the response. 
    const serverArtifact = { type: "server-instance", listen: () => {} };
    const handler = (event: any, context: Context) => {
      // Simulate legacy handler that sets up server and calls context.done
      setTimeout(() => {
        context.done(undefined, { statusCode: 200, body: "Response from context.done" });
      }, 10);
      // Returns server artifact (side effect) but should wait for context.done
      return serverArtifact;
    };

    const promHandler = promisifiedHandler(handler as any) as any;

    const result = await promHandler({}, mockContext);

    // Should wait for and return the context.done result, NOT the server artifact
    expect(result).toEqual({ statusCode: 200, body: "Response from context.done" });
    expect(result).not.toBe(serverArtifact);
  });
});
