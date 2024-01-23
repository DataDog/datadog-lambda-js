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
          nestedBoolean: false,
        },
        val: null,
        number: 1,
        aBoolean: true,
      },
    });
    expect(setTag.mock.calls).toEqual([
      ["lambda_payload.request.keyOne", "foobar"],
      ["lambda_payload.request.myObject.anotherKey.0", "array"],
      ["lambda_payload.request.myObject.anotherKey.1", "of"],
      ["lambda_payload.request.myObject.anotherKey.2", "values"],
      ["lambda_payload.request.myObject.nestedBoolean", "false"],
      ["lambda_payload.request.val", null],
      ["lambda_payload.request.number", "1"],
      ["lambda_payload.request.aBoolean", "true"],
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
      ["lambda_payload.request.vals.0.thingOne", "1"],
      ["lambda_payload.request.vals.1.thingTwo", "2"],
    ]);
  });
  it("tags reach max depth", () => {
    const span = {
      setTag,
    };

    tagObject(
      span,
      "function.request",
      {
        hello: "world",
        level1: {
          level2_dict: {
            level3: 3,
          },
          level2_list: [null, true, "nice", { l3: "v3" }],
          level2_bool: true,
          level2_int: 2,
          level2_null: null,
          level2_empty_obj: {},
        },
        vals: [{ thingOne: 1 }, { thingTwo: 2 }],
      },
      0,
      2,
    );
    expect(setTag.mock.calls).toEqual([
      ["function.request.hello", "world"],
      ["function.request.level1.level2_dict", '{"level3":3}'],
      ["function.request.level1.level2_list", '[null,true,"nice",{"l3":"v3"}]'],
      ["function.request.level1.level2_bool", "true"],
      ["function.request.level1.level2_int", "2"],
      ["function.request.vals.0", '{"thingOne":1}'],
      ["function.request.vals.1", '{"thingTwo":2}'],
      ["function.request.level1.level2_null", null],
      ["function.request.level1.level2_empty_obj", "{}"],
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
