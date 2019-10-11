import { Context, Handler } from "aws-lambda";

import { didFunctionColdStart } from "./cold-start";
import { wrap } from "./handler";
import { LogLevel, setLogLevel } from "./log";

import { sendDistributionMetric } from "../index";

jest.mock("../index");

const mockedSendDistributionMetric = sendDistributionMetric as jest.Mock<typeof sendDistributionMetric>;

afterEach(() => {
  mockedSendDistributionMetric.mockClear();
});

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

  it("increments invocations for each function call", async () => {
    const handler: Handler = (event, context, callback) => {
      callback(null, { statusCode: 200, body: "The body of the response" });
    };

    const wrappedHandler = wrap(handler, () => {}, async () => {});

    await wrappedHandler({}, mockContext, () => {});

    expect(mockedSendDistributionMetric).toBeCalledTimes(1);
    expect(mockedSendDistributionMetric).toBeCalledWith(
      "aws.lambda.enhanced.invocations",
      1,
      "region:us-east-1",
      "account_id:123497598159",
      "functionname:my-test-lambda",
      "cold_start:true",
    );

    await wrappedHandler({}, mockContext, () => {});
    await wrappedHandler({}, mockContext, () => {});
    await wrappedHandler({}, mockContext, () => {});

    expect(mockedSendDistributionMetric).toBeCalledTimes(4);
  });

  it("increments errors correctly", async () => {
    const handler: Handler = (event, context, callback) => {
      throw Error("Some error");
    };

    const wrappedHandler = wrap(handler, () => {}, async () => {});

    const result = wrappedHandler({}, mockContext, () => {});
    await expect(result).rejects.toEqual(Error("Some error"));

    expect(mockedSendDistributionMetric).toBeCalledTimes(2);
    expect(mockedSendDistributionMetric).toBeCalledWith(
      "aws.lambda.enhanced.invocations",
      1,
      "region:us-east-1",
      "account_id:123497598159",
      "functionname:my-test-lambda",
      "cold_start:true",
    );
    expect(mockedSendDistributionMetric).toBeCalledWith(
      "aws.lambda.enhanced.errors",
      1,
      "region:us-east-1",
      "account_id:123497598159",
      "functionname:my-test-lambda",
      "cold_start:true",
    );
  });
});
