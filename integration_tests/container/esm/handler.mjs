import { promisify } from "util";

// Verify top-level await works in the container-image ESM path
await promisify(setTimeout)(50);

export function handle(event) {
  return { message: "hello, dog!" };
}
