import { Context, Handler } from "aws-lambda";

import { wrap } from "./handler";
import { setErrorLoggingEnabled } from "./log";

beforeEach(() => {
  setErrorLoggingEnabled(false);
});

describe("wrap", () => {
  it("invokes the original lambda callback, when callback used by the handler ", (done) => {
    const handler: Handler = (event, context, callback) => {
      callback(null, { statusCode: 200, body: "The body of the response" });
    };

    let calledStart = false;
    let calledComplete = false;

    const wrappedHandler = wrap(
      handler,
      () => {
        calledStart = true;
      },
      async () => {
        calledComplete = true;
      },
    );

    const result = wrappedHandler({}, {} as Context, () => {
      done();
    });
    expect(result).toBeUndefined();
    expect(calledStart).toBeTruthy();
    expect(calledComplete).toBeTruthy();
  });

  it("recovers from onStart throwing an error and invokes the original lambda callback", (done) => {
    const handler: Handler = (event, context, callback) => {
      callback(null, { statusCode: 200, body: "The body of the response" });
    };

    let calledStart = false;
    let calledComplete = false;

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

    const result = wrappedHandler({}, {} as Context, () => {
      done();
    });
    expect(result).toBeUndefined();
    expect(calledStart).toBeTruthy();
    expect(calledComplete).toBeTruthy();
  });

  it("recovers from onComplete throwing an error and invokes the original lambda callback", (done) => {
    const handler: Handler = (event, context, callback) => {
      callback(null, { statusCode: 200, body: "The body of the response" });
    };

    let calledStart = false;
    let calledComplete = false;

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

    const result = wrappedHandler({}, {} as Context, () => {
      done();
    });
    expect(result).toBeUndefined();
    expect(calledStart).toBeTruthy();
    expect(calledComplete).toBeTruthy();
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

    const result = await wrappedHandler({}, {} as Context, () => {
      calledOriginalHandler = true;
    });

    expect(result).toEqual({ statusCode: 200, body: "The body of the response" });
    expect(calledStart).toBeTruthy();
    expect(calledComplete).toBeTruthy();
    expect(calledOriginalHandler).toBeFalsy();
  });

  it("recovers from onComplete throwing an error and returns a promise", async () => {
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
        throw Error("An error");
      },
    );

    const result = await wrappedHandler({}, {} as Context, () => {
      calledOriginalHandler = true;
    });

    expect(result).toEqual({ statusCode: 200, body: "The body of the response" });
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

    const result = wrappedHandler({}, {} as Context, () => {
      calledOriginalHandler = true;
    });
    await expect(result).rejects.toEqual(Error("Some error"));

    expect(calledStart).toBeTruthy();
    expect(calledComplete).toBeTruthy();
    expect(calledOriginalHandler).toBeFalsy();
  });
});
