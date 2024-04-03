export interface LambdaResponse {
    batchItemFailures?: Array<{ itemIdentifier: string }>
}

export function isBatchItemFailure(lambdaResponse: any): lambdaResponse is LambdaResponse {
    return typeof lambdaResponse === 'object' && 'batchItemFailures' in lambdaResponse;
} 