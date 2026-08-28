/**
 * Normalizes header names to lowercase and collapses multi-value headers into a single
 * comma-separated value, which is the shape the WAF expects. When a name appears in both maps the
 * multi-value one wins.
 *
 * API Gateway v1 and application load balancer payloads carry `headers` and `multiValueHeaders`,
 * both on the request event and on the handler result.
 */
export function normalizeHeaders(
  headers?: Record<string, string>,
  multiValueHeaders?: Record<string, string[]>,
): Record<string, string> {
  if (!headers && !multiValueHeaders) return {};

  const result: Record<string, string> = {};

  if (multiValueHeaders) {
    for (const [key, values] of Object.entries(multiValueHeaders)) {
      if (values && values.length > 0) {
        result[key.toLowerCase()] = values.join(", ");
      }
    }
  }

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (!(lowerKey in result) && value !== undefined) {
        result[lowerKey] = value;
      }
    }
  }

  return result;
}
