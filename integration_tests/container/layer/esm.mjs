// Plain unwrapped ESM user handler with top-level await, exercising the
// layer's ESM loader registration (Module.register in handler.mjs) via
// DD_LAMBDA_HANDLER=esm.handle.
import { promisify } from "util";

// Verify top level await
await promisify(setTimeout)(100);

export function handle(ev) {
  return { message: "hello, dog!" };
}
