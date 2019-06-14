// This only imports the type of KMS, not the class. As we don't do an instantiation typescript will compile this away.
import { KMS } from "aws-sdk";
import { logError } from "utils";

// In order to avoid the layer adding the 40mb aws-sdk to a deployment, (which is always available
// in the lambda environment anyway), we use require to import the sdk, and return an error if someone
// tries to decrypt a value.
export class KMSService {
  private kms?: KMS;

  constructor() {
    try {
      const kmsType = require("aws-sdk").KMS;
      this.kms = new kmsType() as KMS;
    } catch {
      logError("optional dependency aws-sdk not installed. KMS key decryption will not work");
    }
  }

  public async decrypt(value: string): Promise<string> {
    if (this.kms === undefined) {
      // This error should only occur if the user is running this code outside of the lambda environment,
      // (say a local development environment).
      throw Error("optional dependency aws-sdk not installed. KMS key decryption will not work");
    }
    const buffer = Buffer.from(value, "base64");

    const result = await this.kms.decrypt({ CiphertextBlob: buffer }).promise();
    if (result.Plaintext === undefined) {
      throw Error("Couldn't decrypt value");
    }
    return result.Plaintext.toString("ascii");
  }
}
