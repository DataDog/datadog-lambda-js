import nock from "nock";
import { KMSService } from "./kms-service";

describe("KMSService", () => {
  const ENCRYPTED_KEY = "BQICAHj0djbIQaGrIfSD2gstvRF3h8YGMeEvO5rRHNiuWwSeegEFl57KxNejRn"; // random fake key
  const KEY_ID = "arn:aws:kms:us-east-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab";
  const EXPECTED_RESULT = "myDecryptedKey";
  const EXPECTED_ERROR_MESSAGE = "Couldn't decrypt ciphertext";

  beforeAll(() => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = "my-test-function";
    process.env.AWS_ACCESS_KEY_ID = "aaa";
    process.env.AWS_SECRET_ACCESS_KEY = "bbb";
    process.env.AWS_REGION = "us-east-1";
  });

  afterAll(() => {
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
  });

  it("decrypts when the API key was encrypted with an encryption context", async () => {
    const firstFakeKmsCall = nock("https://kms.us-east-1.amazonaws.com:443", { encodedQueryParams: true })
      .post("/", {
        CiphertextBlob: "BQICAHj0djbIQaGrIfSD2gstvRF3h8YGMeEvO5rRHNiuWwSeegEFl57KxNejRg==",
      })
      .reply(400, {
        KeyId: KEY_ID,
      });

    const secondFakeKmsCall = nock("https://kms.us-east-1.amazonaws.com:443", { encodedQueryParams: true })
      .post("/", {
        CiphertextBlob: "BQICAHj0djbIQaGrIfSD2gstvRF3h8YGMeEvO5rRHNiuWwSeegEFl57KxNejRg==",
        EncryptionContext: {
          LambdaFunctionName: "my-test-function",
        },
      })
      .reply(200, {
        KeyId: KEY_ID,
        Plaintext: Buffer.from(EXPECTED_RESULT, "ascii").toString("base64"),
      });

    const kmsService = new KMSService();
    const result = await kmsService.decrypt(ENCRYPTED_KEY);
    expect(result).toEqual(EXPECTED_RESULT);
    firstFakeKmsCall.done();
    secondFakeKmsCall.done();
  });

  it("decrypts when the API key was encrypted without an encryption context", async () => {
    const fakeKmsCall = nock("https://kms.us-east-1.amazonaws.com:443", { encodedQueryParams: true })
      .post("/", {
        CiphertextBlob: "BQICAHj0djbIQaGrIfSD2gstvRF3h8YGMeEvO5rRHNiuWwSeegEFl57KxNejRg==",
      })
      .reply(200, {
        KeyId: KEY_ID,
        Plaintext: Buffer.from(EXPECTED_RESULT),
      });

    const kmsService = new KMSService();
    const result = await kmsService.decrypt(ENCRYPTED_KEY);
    expect(result).toEqual(EXPECTED_RESULT);
    fakeKmsCall.done();
  });

  it("throws an error when unable to decrypt", async () => {
    const fakeKmsCall = nock("https://kms.us-east-1.amazonaws.com:443", { encodedQueryParams: true })
      .post("/", {
        CiphertextBlob: "BQICAHj0djbIQaGrIfSD2gstvRF3h8YGMeEvO5rRHNiuWwSeegEFl57KxNejRg==",
      })
      .reply(400, {
        KeyId: KEY_ID,
      });

    const kmsService = new KMSService();
    try {
      await kmsService.decrypt(ENCRYPTED_KEY);
      fail();
    } catch (e) {
      if (e instanceof Error) {
        expect((e as Error).message).toEqual(EXPECTED_ERROR_MESSAGE);
      }
    }
    fakeKmsCall.done();
  });

  it("decrypts when the API key was encrypted with an encryption context using aws sdk v3", async () => {
    const fakeKmsCall = nock("https://kms.us-east-1.amazonaws.com:443", { encodedQueryParams: true })
      .post("/", {
        CiphertextBlob: "BQICAHj0djbIQaGrIfSD2gstvRF3h8YGMeEvO5rRHNiuWwSeegEFl57KxNejRg==",
        EncryptionContext: {
          LambdaFunctionName: "my-test-function",
        },
      })
      .reply(200, {
        KeyId: KEY_ID,
        Plaintext: Buffer.from(EXPECTED_RESULT, "ascii").toString("base64"),
      });

    const kmsService = new KMSService();
    const result = await kmsService.decryptV3(Buffer.from(ENCRYPTED_KEY, "base64"), {});
    expect(Buffer.from(result).toString("ascii")).toEqual(EXPECTED_RESULT);
    fakeKmsCall.done();
  });

  it("decrypts when the API key was encrypted without an encryption context using aws sdk v3", async () => {
    const fakeKmsCall = nock("https://kms.us-east-1.amazonaws.com:443", { encodedQueryParams: true })
      .post("/", {
        CiphertextBlob: "BQICAHj0djbIQaGrIfSD2gstvRF3h8YGMeEvO5rRHNiuWwSeegEFl57KxNejRg==",
      })
      .reply(200, {
        KeyId: KEY_ID,
        Plaintext: Buffer.from(EXPECTED_RESULT, "ascii").toString("base64"),
      });

    const kmsService = new KMSService();
    const result = await kmsService.decryptV3(Buffer.from(ENCRYPTED_KEY, "base64"), {});
    expect(Buffer.from(result).toString("ascii")).toEqual(EXPECTED_RESULT);
    fakeKmsCall.done();
  });

  it("configures FIPS endpoint for GovCloud regions", async () => {
    try {
      process.env.AWS_REGION = "us-gov-west-1";

      const mockKmsConstructor = jest.fn();
      jest.mock("aws-sdk/clients/kms", () => mockKmsConstructor);
      mockKmsConstructor.mockImplementation(() => ({
        decrypt: () => ({
          promise: () => Promise.resolve({ Plaintext: Buffer.from(EXPECTED_RESULT) })
        })
      }));

      // Create service and call decrypt
      const kmsService = new KMSService();
      await kmsService.decrypt(ENCRYPTED_KEY);

      // Verify FIPS endpoint was used
      expect(mockKmsConstructor).toHaveBeenCalledWith({
        endpoint: "https://kms-fips.us-gov-west-1.amazonaws.com"
      });

    } finally {
      process.env.AWS_REGION = "us-east-1";
      jest.restoreAllMocks();
    }
  });
});
