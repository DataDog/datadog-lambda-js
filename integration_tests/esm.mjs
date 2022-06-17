import { promisify } from 'util'

// Verify top level await
await promisify(setTimeout)(100);

export function handle(ev) {
    return { message: "hello, dog!" };
}