// In order to avoid the layer adding the 40mb aws-sdk to a deployment, (which is always available
// in the Lambda environment anyway), we use require to import the SDK.

export class KMSService {
  private encryptionContext;

  constructor() {
    this.encryptionContext = { LambdaFunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME ?? "" };
  }

  public async decrypt(ciphertext: string): Promise<string> {
    const buffer = Buffer.from(ciphertext, "base64");
    let kms;

    const region = process.env.AWS_REGION;
    const isGovRegion = region !== undefined && region.startsWith("us-gov-");
    let kmsClientParams = {};
    if (isGovRegion) {
      // Endpoints: https://docs.aws.amazon.com/general/latest/gr/kms.html
      kmsClientParams = {
        endpoint: `https://kms-fips.${region}.amazonaws.com`,
      };
    }

    // Explicitly try/catch this require to appease esbuild and ts compiler
    // otherwise users would need to mark this as `external`
    // see https://github.com/DataDog/datadog-lambda-js/pull/409
    try {
      kms = require("aws-sdk/clients/kms");
    } catch (err) {
      if ((err as any).code === "MODULE_NOT_FOUND") {
        // Node 18
        return this.decryptV3(buffer, kmsClientParams);
      }
    }
    try {
      // Configure KMS client to use FIPS endpoint
      const kmsClient = new kms(kmsClientParams);

      // When the API key is encrypted using the AWS console, the function name is added as an encryption context.
      // When the API key is encrypted using the AWS CLI, no encryption context is added.
      // We need to try decrypting the API key both with and without the encryption context.
      let result;
      // Try without encryption context, in case API key was encrypted using the AWS CLI
      try {
        result = await kmsClient.decrypt({ CiphertextBlob: buffer }).promise();
      } catch {
        // Then try with encryption context, in case API key was encrypted using the AWS Console
        result = await kmsClient
          .decrypt({ CiphertextBlob: buffer, EncryptionContext: this.encryptionContext })
          .promise();
      }

      if (result.Plaintext === undefined) {
        throw Error();
      }
      return result.Plaintext.toString("ascii");
    } catch (err) {
      throw Error("Couldn't decrypt ciphertext");
    }
  }

  // Node 18 or AWS SDK V3
  public async decryptV3(buffer: Buffer, kmsClientParams: any): Promise<string> {
    // tslint:disable-next-line: variable-name one-variable-per-declaration
    let KMSClient, DecryptCommand;
    // Explicitly try/catch this require to appease esbuild and ts compiler
    // otherwise users would need to mark this as `external`
    // see https://github.com/DataDog/datadog-lambda-js/pull/409
    try {
      ({ KMSClient, DecryptCommand } = require("@aws-sdk/client-kms"));
    } catch (e) {
      throw Error("Can't load AWS SDK v2 or v3 to decrypt KMS key, custom metrics may not be sent");
    }

    const kmsClient = new KMSClient(kmsClientParams);
    let result;
    try {
      const decryptCommand = new DecryptCommand({ CiphertextBlob: buffer });
      result = await kmsClient.send(decryptCommand);
    } catch {
      const decryptCommand = new DecryptCommand({ CiphertextBlob: buffer, EncryptionContext: this.encryptionContext });
      result = await kmsClient.send(decryptCommand);
    }
    const finalRes = Buffer.from(result.Plaintext).toString("ascii");
    return finalRes;
  }
}
