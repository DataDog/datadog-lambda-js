Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
process.stdout.write(JSON.stringify({ coldStartFixture: __filename }) + "\n");
