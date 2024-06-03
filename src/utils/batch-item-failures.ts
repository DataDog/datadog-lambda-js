export function isBatchItemFailure(lambdaResponse: any): boolean {
  return (
    typeof lambdaResponse === "object" &&
    lambdaResponse !== null &&
    "batchItemFailures" in lambdaResponse &&
    Array.isArray(lambdaResponse.batchItemFailures)
  );
}

export function batchItemFailureCount(lambdaResponse: any): number {
  return lambdaResponse?.batchItemFailures?.length || 0; // Guard clause in case someone calls this without checking isBatchItemFailure
}
