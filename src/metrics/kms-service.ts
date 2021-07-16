// In order to avoid the layer adding the 40mb aws-sdk to a deployment, (which is always available
// in the Lambda environment anyway), we use require to import the SDK.

import { logError } from "../utils";

export class KMSService {
  public async decrypt(ciphertext: string): Promise<string> {
    try {
      const kms = require("aws-sdk/clients/kms");
      const kmsClient = new kms();
      const buffer = Buffer.from(ciphertext, "base64");

      // When the API key is encrypted using the AWS console, the function name is added as an encryption context.
      // When the API key is encrypted using the AWS CLI, no encryption context is added.
      // We need to try decrypting the API key both with and without the encryption context.
      let result;
      // Try without encryption context, in case API key was encrypted using the AWS CLI
      try {
        result = await kmsClient.decrypt({ CiphertextBlob: buffer }).promise();
      } catch {
        // Then try with encryption context, in case API key was encrypted using the AWS Console
        const encryptionContext = { LambdaFunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME ?? "" };
        result = await kmsClient.decrypt({ CiphertextBlob: buffer, EncryptionContext: encryptionContext }).promise();
      }

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
      throw Error("Couldn't decrypt ciphertext");
    }
  }
}
