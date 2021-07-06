// In order to avoid the layer adding the 40mb aws-sdk to a deployment, (which is always available
// in the lambda environment anyway), we use require to import the sdk, and return an error if someone
// tries to decrypt a value.

import { logError } from "../utils";

export class KMSService {
  public async decrypt(value: string): Promise<string> {
    try {
      const kmsType = require("aws-sdk/clients/kms");
      const kms = new kmsType();
      const buffer = Buffer.from(value, "base64");
      const encryptionContext = { LambdaFunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME ?? "" };
      const result = await kms.decrypt({ CiphertextBlob: buffer, EncryptionContext: encryptionContext }).promise();
      if (result.Plaintext === undefined) {
        throw Error();
      }
      return result.Plaintext.toString("ascii");
    } catch (err) {
      if (err.code === "MODULE_NOT_FOUND") {
        const errorMsg = "optional dependency aws-sdk not installed. KMS key decryption will not work";
        logError(errorMsg);
        throw Error(errorMsg);
      }
      throw Error("Couldn't decrypt value");
    }
  }
}
