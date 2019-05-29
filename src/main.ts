import { APIGatewayProxyHandler } from "aws-lambda";

/**
 * Wraps your AWS lambda handle functions to add tracing/metrics support
 * @param handler A lambda handler function
 */
export function datadog(handler: APIGatewayProxyHandler): APIGatewayProxyHandler {
  return (event, context, callback) => {
    handler(event, context, callback);
  };
}
