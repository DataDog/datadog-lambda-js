import {
  deterministicMd5HashInBinary,
  deterministicMd5HashToBigIntString,
  hexToBinary,
} from "./step-functions-trace-context";

describe("test_hexToBinary", () => {
  it("test hex 0 to binary", () => {
    const actual = hexToBinary("0");
    expect(actual).toEqual("0000");
  });

  it("test hex 1 to binary", () => {
    const actual = hexToBinary("1");
    expect(actual).toEqual("0001");
  });

  it("test hex 2 to binary", () => {
    const actual = hexToBinary("2");
    expect(actual).toEqual("0010");
  });

  it("test hex 3 to binary", () => {
    const actual = hexToBinary("3");
    expect(actual).toEqual("0011");
  });

  it("test hex 4 to binary", () => {
    const actual = hexToBinary("4");
    expect(actual).toEqual("0100");
  });

  it("test hex 5 to binary", () => {
    const actual = hexToBinary("5");
    expect(actual).toEqual("0101");
  });
  it("test hex 6 to binary", () => {
    const actual = hexToBinary("6");
    expect(actual).toEqual("0110");
  });

  it("test hex 7 to binary", () => {
    const actual = hexToBinary("7");
    expect(actual).toEqual("0111");
  });

  it("test hex 8 to binary", () => {
    const actual = hexToBinary("8");
    expect(actual).toEqual("1000");
  });

  it("test hex 9 to binary", () => {
    const actual = hexToBinary("9");
    expect(actual).toEqual("1001");
  });

  it("test hex a to binary", () => {
    const actual = hexToBinary("a");
    expect(actual).toEqual("1010");
  });

  it("test hex b to binary", () => {
    const actual = hexToBinary("b");
    expect(actual).toEqual("1011");
  });

  it("test hex c to binary", () => {
    const actual = hexToBinary("c");
    expect(actual).toEqual("1100");
  });

  it("test hex d to binary", () => {
    const actual = hexToBinary("d");
    expect(actual).toEqual("1101");
  });

  it("test hex e to binary", () => {
    const actual = hexToBinary("e");
    expect(actual).toEqual("1110");
  });

  it("test hex f to binary", () => {
    const actual = hexToBinary("f");
    expect(actual).toEqual("1111");
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
