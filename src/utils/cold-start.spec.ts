import { _resetColdStart, didFunctionColdStart, setColdStart } from "./cold-start";

beforeEach(_resetColdStart);
afterAll(_resetColdStart);

describe("cold-start", () => {
  it("identifies cold starts on the first execution", () => {
    setColdStart();
    expect(didFunctionColdStart()).toEqual(true);
  });

  it("identifies non-cold starts on subsequent executions", () => {
    setColdStart();
    expect(didFunctionColdStart()).toEqual(true);

    setColdStart();
    expect(didFunctionColdStart()).toEqual(false);

    setColdStart();
    expect(didFunctionColdStart()).toEqual(false);
  });
});
