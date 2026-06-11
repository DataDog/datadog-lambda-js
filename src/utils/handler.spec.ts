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

  it("waits for context.succeed when handler returns undefined and length < 3", async () => {
    // A handler with no callback parameter that returns undefined must NOT cause the wrapper
    // to resolve immediately with undefined. Real-world handlers (notably the ones using
    // aws-serverless-express's `proxy(server, event, context)` with the default
    // CONTEXT_SUCCEED resolution mode) finish via context.succeed long after the synchronous
    // body returns. Eager-resolving on undefined truncates that work, makes Lambda return
    // an empty response, and freezes the worker before stdout flushes (no CloudWatch output).
    const handler: Handler = (event, context) => {
      setTimeout(() => {
        context.succeed({ statusCode: 200, body: "deferred via context.succeed" });
      }, 10);
      // Implicitly returns undefined.
    };

    const promHandler = promisifiedHandler(handler) as any;
    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 200, body: "deferred via context.succeed" });
  });

  it("waits for context.done when handler returns undefined and length < 3", async () => {
    const handler: Handler = (event, context) => {
      setTimeout(() => {
        context.done(undefined, { statusCode: 200, body: "deferred via context.done" });
      }, 10);
    };

    const promHandler = promisifiedHandler(handler) as any;
    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 200, body: "deferred via context.done" });
  });

  it("waits for context.fail when handler returns undefined and length < 3", async () => {
    const handler: Handler = (event, context) => {
      setTimeout(() => {
        context.fail(new Error("deferred failure"));
      }, 10);
    };

    const promHandler = promisifiedHandler(handler) as any;
    const result = promHandler({}, mockContext);

    await expect(result).rejects.toEqual(new Error("deferred failure"));
  });

  it("simulates aws-serverless-express proxy() pattern", async () => {
    // Closely mirrors a real-world handler shape:
    //
    //   exports.handler = (event, context) => {
    //     proxy(server, event, context);   // called, NOT returned
    //   };
    //
    // `proxy` here stands in for aws-serverless-express@3 in default CONTEXT_SUCCEED mode,
    // which calls `context.succeed(response)` asynchronously once Express finishes handling
    // the request. The handler itself returns undefined.
    const proxy = (_server: unknown, _event: any, context: Context) => {
      setImmediate(() => {
        context.succeed({ statusCode: 200, body: "Express response" });
      });
    };
    const server = { listen: () => {}, close: () => {} };

    const handler = (event: any, context: Context) => {
      proxy(server, event, context);
      // No return — exactly the customer's handler shape.
    };

    const promHandler = promisifiedHandler(handler as any) as any;
    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 200, body: "Express response" });
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

  it("detects http.Server-like artifact (has listen AND close)", async () => {
    // Detection method 1: Node.js http.Server or similar (has both listen and close)
    const serverArtifact = {
      listen: () => {},
      close: () => {},
      _handle: {},
    };
    const handler = (event: any, context: Context) => {
      setTimeout(() => {
        context.done(undefined, { statusCode: 200, body: "Response from context.done" });
      }, 10);
      return serverArtifact;
    };

    const promHandler = promisifiedHandler(handler as any) as any;
    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 200, body: "Response from context.done" });
    expect(result).not.toBe(serverArtifact);
  });

  it("detects EventEmitter-like artifact (has on AND emit)", async () => {
    // Detection method 2: EventEmitter-like (has .on and .emit)
    const emitterArtifact = {
      on: () => {},
      emit: () => {},
      listeners: [],
    };
    const handler = (event: any, context: Context) => {
      setTimeout(() => {
        context.succeed({ statusCode: 200, body: "EventEmitter response" });
      }, 10);
      return emitterArtifact;
    };

    const promHandler = promisifiedHandler(handler as any) as any;
    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 200, body: "EventEmitter response" });
    expect(result).not.toBe(emitterArtifact);
  });

  it("detects EventEmitter instance", async () => {
    // Detection method 3: Instance of EventEmitter (covers Server, Socket, etc.)
    const { EventEmitter } = require("events");
    const artifact = new EventEmitter();

    const handler = (event: any, context: Context) => {
      setTimeout(() => {
        context.succeed({ statusCode: 200, body: "From EventEmitter instance" });
      }, 10);
      return artifact;
    };

    const promHandler = promisifiedHandler(handler as any) as any;
    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 200, body: "From EventEmitter instance" });
    expect(result).not.toBe(artifact);
  });

  it("detects artifact by constructor name (Server/Socket/Emitter)", async () => {
    // Detection method 4: Constructor name matches /Server|Socket|Emitter/i
    class CustomServer {
      public port = 3000;
      public start() {
        return "started";
      }
    }
    const artifact = new CustomServer();

    const handler = (event: any, context: Context) => {
      setTimeout(() => {
        context.succeed({ statusCode: 200, body: "From CustomServer" });
      }, 10);
      return artifact;
    };

    const promHandler = promisifiedHandler(handler as any) as any;
    const result = await promHandler({}, mockContext);

    expect(result).toEqual({ statusCode: 200, body: "From CustomServer" });
    expect(result).not.toBe(artifact);
  });

  it("does NOT treat plain response objects as artifacts", async () => {
    // Plain objects that happen to have some function properties should still
    // be treated as artifacts to be safe, but objects without functions are not artifacts
    const handler = (event: any, context: Context) => {
      // This is a legitimate Lambda response
      return { statusCode: 200, body: "Plain response", headers: { "Content-Type": "text/plain" } };
    };

    const promHandler = promisifiedHandler(handler as any) as any;
    const result = await promHandler({}, mockContext);

    // Should return immediately with the response object
    expect(result).toEqual({ statusCode: 200, body: "Plain response", headers: { "Content-Type": "text/plain" } });
  });
});
