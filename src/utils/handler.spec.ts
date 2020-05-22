import { Context, Handler } from "aws-lambda";

import { didFunctionColdStart } from "./cold-start";
import { wrap } from "./handler";
import { LogLevel, setLogLevel } from "./log";

const mockContext = ({
  invokedFunctionArn: "arn:aws:lambda:us-east-1:123497598159:function:my-test-lambda",
} as any) as Context;

beforeEach(() => {
  setLogLevel(LogLevel.NONE);
});

describe("wrap", () => {
  it("returns a promise when callback used by the handler", async () => {
    const handler: Handler = (event, context, callback) => {
      callback(null, { statusCode: 200, body: "The body of the response" });
    };

    let calledStart = false;
    let calledComplete = false;
    let calledOriginalHandler = false;

    const wrappedHandler = wrap(
      handler,
      () => {
        calledStart = true;
      },
      async () => {
        calledComplete = true;
      },
    );

    const result = await wrappedHandler({}, mockContext, () => {
      calledOriginalHandler = true;
    });
    expect(result).toEqual({ statusCode: 200, body: "The body of the response" });
    expect(calledStart).toBeTruthy();
    expect(calledComplete).toBeTruthy();
    expect(calledOriginalHandler).toBeFalsy();
  });

  it("recovers from onStart throwing an error and invokes the original lambda callback", async () => {
    const handler: Handler = (event, context, callback) => {
      callback(null, { statusCode: 200, body: "The body of the response" });
    };

    let calledStart = false;
    let calledComplete = false;
    let calledOriginalHandler = false;

    const wrappedHandler = wrap(
      handler,
      () => {
        calledStart = true;
        throw Error("Some Error");
      },
      async () => {
        calledComplete = true;
      },
    );

    const result = await wrappedHandler({}, mockContext, () => {
      calledOriginalHandler = true;
    });
    expect(result).toEqual({ statusCode: 200, body: "The body of the response" });
    expect(calledStart).toBeTruthy();
    expect(calledComplete).toBeTruthy();
    expect(calledOriginalHandler).toBeFalsy();
  });

  it("recovers from onComplete throwing an error and invokes the original lambda callback", async () => {
    const handler: Handler = (event, context, callback) => {
      callback(null, { statusCode: 200, body: "The body of the response" });
    };

    let calledStart = false;
    let calledComplete = false;
    let calledOriginalHandler = false;

    const wrappedHandler = wrap(
      handler,
      () => {
        calledStart = true;
      },
      async () => {
        calledComplete = true;
        throw Error("Some Error");
      },
    );

    const result = await wrappedHandler({}, mockContext, () => {
      calledOriginalHandler = true;
    });
    expect(result).toEqual({ statusCode: 200, body: "The body of the response" });
    expect(calledStart).toBeTruthy();
    expect(calledComplete).toBeTruthy();
    expect(calledOriginalHandler).toBeFalsy();
  });

  it("returns a promise when the original handler returns a promise", async () => {
    const handler: Handler = async (event, context, callback) => {
      return { statusCode: 200, body: "The body of the response" };
    };

    let calledStart = false;
    let calledComplete = false;
    let calledOriginalHandler = false;

    const wrappedHandler = wrap(
      handler,
      () => {
        calledStart = true;
      },
      async () => {
        calledComplete = true;
      },
    );

    const result = await wrappedHandler({}, mockContext, () => {
      calledOriginalHandler = true;
    });

    expect(result).toEqual({ statusCode: 200, body: "The body of the response" });
    expect(calledStart).toBeTruthy();
    expect(calledComplete).toBeTruthy();
    expect(calledOriginalHandler).toBeFalsy();
  });

  it("throws an error when the original lambda gives the callback an error", async () => {
    const handler: Handler = (event, context, callback) => {
      return callback(new Error("Some error"), { statusCode: 200, body: "The body of the response" });
    };

    let calledStart = false;
    let calledComplete = false;
    let calledOriginalHandler = false;

    const wrappedHandler = wrap(
      handler,
      () => {
        calledStart = true;
      },
      async () => {
        calledComplete = true;
        throw Error("An error");
      },
    );

    const result = wrappedHandler({}, mockContext, () => {
      calledOriginalHandler = true;
    });

    await expect(result).rejects.toEqual(new Error("Some error"));

    expect(calledStart).toBeTruthy();
    expect(calledComplete).toBeTruthy();
    expect(calledOriginalHandler).toBeFalsy();
  });

  it("throws an error when the original lambda throws an error", async () => {
    const handler: Handler = async (event, context, callback) => {
      throw Error("Some error");
    };

    let calledStart = false;
    let calledComplete = false;
    let calledOriginalHandler = false;

    const wrappedHandler = wrap(
      handler,
      () => {
        calledStart = true;
      },
      async () => {
        calledComplete = true;
      },
    );

    const result = wrappedHandler({}, mockContext, () => {
      calledOriginalHandler = true;
    });
    await expect(result).rejects.toEqual(Error("Some error"));

    expect(calledStart).toBeTruthy();
    expect(calledComplete).toBeTruthy();
    expect(calledOriginalHandler).toBeFalsy();
  });

  it("returns the first result to complete between the callback and the handler promise", async () => {
    const handler: Handler = async (event, context, callback) => {
      callback(null, { statusCode: 204, body: "The callback response" });
      return { statusCode: 200, body: "The promise response" };
    };

    let calledOriginalHandler = false;

    const wrappedHandler = wrap(
      handler,
      () => {},
      async () => {},
    );

    const result = await wrappedHandler({}, mockContext, () => {
      calledOriginalHandler = true;
    });

    expect(result).toEqual({ statusCode: 204, body: "The callback response" });
    expect(calledOriginalHandler).toBeFalsy();
  });

  it("doesn't complete using non-promise return values", async () => {
    const handler: Handler = (event, context, callback) => {
      setTimeout(() => {
        callback(null, { statusCode: 204, body: "The callback response" });
      }, 10);
      return ({ statusCode: 200, body: "The promise response" } as unknown) as void;
    };

    let calledOriginalHandler = false;

    const wrappedHandler = wrap(
      handler,
      () => {},
      async () => {},
    );

    const result = await wrappedHandler({}, mockContext, () => {
      calledOriginalHandler = true;
    });

    expect(result).toEqual({ statusCode: 204, body: "The callback response" });
    expect(calledOriginalHandler).toBeFalsy();
  });
});
