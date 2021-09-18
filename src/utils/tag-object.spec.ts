import { tagObject } from "./tag-object";

describe("tagObject", () => {
  const setTag = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("tags something simple", () => {
    const span = {
      setTag,
    };
    tagObject(span, "lambda_payload", { request: { myKey: "myValue" } });
    expect(setTag).toBeCalledWith("lambda_payload.request.myKey", "myValue");
  });
  it("tags complex objects", () => {
    const span = {
      setTag,
    };
    tagObject(span, "lambda_payload", {
      request: {
        keyOne: "foobar",
        myObject: {
          anotherKey: ["array", "of", "values"],
        },
        val: null,
        number: 1,
      },
    });
    expect(setTag.mock.calls).toEqual([
      ["lambda_payload.request.keyOne", "foobar"],
      ["lambda_payload.request.myObject.anotherKey.0", "array"],
      ["lambda_payload.request.myObject.anotherKey.1", "of"],
      ["lambda_payload.request.myObject.anotherKey.2", "values"],
      ["lambda_payload.request.val", null],
      ["lambda_payload.request.number", 1],
    ]);
  });
  it("tags arrays of objects", () => {
    const span = {
      setTag,
    };
    tagObject(span, "lambda_payload", {
      request: {
        vals: [{ thingOne: 1 }, { thingTwo: 2 }],
      },
    });
    expect(setTag.mock.calls).toEqual([
      ["lambda_payload.request.vals.0.thingOne", 1],
      ["lambda_payload.request.vals.1.thingTwo", 2],
    ]);
  });
  it("redacts common secret keys", () => {
    const span = {
      setTag,
    };
    tagObject(span, "lambda_payload", { request: { headers: { authorization: "myValue" } } });
    expect(setTag).toBeCalledWith("lambda_payload.request.headers.authorization", "redacted");
  });
});
