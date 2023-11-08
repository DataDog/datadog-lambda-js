import { deterministicMd5HashInBinary, deterministicMd5HashToBigIntString, hexToBinary } from "./step-function-service";

describe("test_deterministicMd5HashToBigIntString", () => {
  it("test same hashing number is generated as logs-backend for a random string", () => {
    const actual = deterministicMd5HashToBigIntString("some_testing_random_string");
    expect(actual).toEqual("2251275791555400689");
  });

  it("test same hashing number is generated as logs-backend for execution id # state name # entered time", () => {
    const actual = deterministicMd5HashToBigIntString(
      "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111#step-one#2022-12-08T21:08:19.224Z",
    );
    expect(actual).toEqual("8034507082463708833");
  });
});

describe("test_deterministicMd5HashInBinary", () => {
  it("test same hashing is generated as logs-backend for a random string", () => {
    const actual = deterministicMd5HashInBinary("some_testing_random_string");
    expect(actual).toEqual("0001111100111110001000110110011110010111000110001001001111110001");
  });

  it("test same hashing is generated as logs-backend for an execution id", () => {
    const actual = deterministicMd5HashInBinary(
      "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d041f4",
    );
    expect(actual).toEqual("0010010000101100100000101011111101111100110110001110111100111101");
  });

  it("test same hashing is generated as logs-backend for another execution id", () => {
    const actual = deterministicMd5HashInBinary(
      "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111",
    );
    expect(actual).toEqual("0010001100110000011011011111010000100111100000110000100100101010");
  });

  it("test same hashing is generated as logs-backend for execution id # state name # entered time", () => {
    const actual = deterministicMd5HashInBinary(
      "arn:aws:states:sa-east-1:601427271234:express:DatadogStateMachine:acaf1a67-336a-e854-1599-2a627eb2dd8a:c8baf081-31f1-464d-971f-70cb17d01111#step-one#2022-12-08T21:08:19.224Z",
    );
    expect(actual).toEqual("0110111110000000010011011001111101110011100111000000011010100001");
  });

  it("test hashing different strings would generate different hashes", () => {
    const times = 20;
    for (let i = 0; i < times; i++) {
      for (let j = i + 1; j < times; j++) {
        expect(deterministicMd5HashInBinary(i.toString())).not.toMatch(deterministicMd5HashInBinary(j.toString()));
      }
    }
  });

  it("test always leading with 0", () => {
    for (let i = 0; i < 20; i++) {
      expect(deterministicMd5HashInBinary(i.toString()).substring(0, 1)).toMatch("0");
    }
  });
});

describe.each([
  ["0", "0000"],
  ["1", "0001"],
  ["2", "0010"],
  ["3", "0011"],
  ["4", "0100"],
  ["5", "0101"],
  ["6", "0110"],
  ["7", "0111"],
  ["8", "1000"],
  ["9", "1001"],
  ["a", "1010"],
  ["b", "1011"],
  ["c", "1100"],
  ["d", "1101"],
  ["e", "1110"],
  ["f", "1111"],
])(`test hexToBinary`, (hex, expected) => {
  test(`${hex} to binary returns ${expected}`, () => {
    expect(hexToBinary(hex)).toBe(expected);
  });
});
