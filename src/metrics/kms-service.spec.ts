import { KMSService } from "./kms-service";
import nock from "nock";

describe("KMSService", () => {
  it("decrypts", async () => {
    const encryptedKEy = "BQICAHj0djbIQaGrIfSD2gstvRF3h8YGMeEvO5rRHNiuWwSeegEFl57KxNejRn"; //random fake key

    //setting up the env variables
    process.env.AWS_LAMBDA_FUNCTION_NAME = "my-test-function";
    process.env.AWS_ACCESS_KEY_ID = "aaa";
    process.env.AWS_SECRET_ACCESS_KEY = "bbb";
    process.env.AWS_REGION = "us-east-1";

    const tests = [
      {
        result: {
          Plaintext: Buffer.from("myDecryptedKey"),
        },
        expectedResult: "myDecryptedKey",
        shouldRaiseAnError: false,
        errorMsg: undefined,
        statusCode: 200,
      },
      {
        result: {},
        expectedResult: undefined,
        shouldRaiseAnError: true,
        errorMsg: "Couldn't decrypt value",
        statusCode: 200,
      },
      {
        result: {},
        expectedResult: undefined,
        shouldRaiseAnError: true,
        errorMsg: "Couldn't decrypt value",
        statusCode: 400,
      },
    ];

    tests.forEach(async (testCase) => {
      //faking the KMS call
      const fakeCall = nock("https://kms.us-east-1.amazonaws.com:443", { encodedQueryParams: true })
        .post("/", {
          CiphertextBlob: "BQICAHj0djbIQaGrIfSD2gstvRF3h8YGMeEvO5rRHNiuWwSeegEFl57KxNejRg==",
          EncryptionContext: {
            LambdaFunctionName: "my-test-function",
          },
        })
        .reply(testCase.statusCode, {
          KeyId: "arn:aws:kms:us-east-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab",
          ...testCase.result,
        });

      const kmsService = new KMSService();
      if (testCase.shouldRaiseAnError) {
        try {
          await kmsService.decrypt(encryptedKEy);
          fail();
        } catch (e) {
          expect(e.message).toEqual(testCase.errorMsg);
        }
      } else {
        const result = await kmsService.decrypt(encryptedKEy);
        expect(result).toEqual(testCase.expectedResult);
      }

      //verify that the call was actually done
      fakeCall.done();
    });
  });
});
