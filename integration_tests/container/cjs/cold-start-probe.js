// Deliberate fixture-only load cost, well above the 10ms tracing threshold.
// No busy loop or machine-speed-dependent module count.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
process.stdout.write(JSON.stringify({ coldStartFixture: __filename }) + "\n");
