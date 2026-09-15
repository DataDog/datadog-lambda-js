import { spawn } from "node:child_process";
import { once } from "node:events";
import * as http from "node:http";
import * as Module from "node:module";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as zlib from "node:zlib";

const fixtureDirectory = path.join(__dirname, "runtime", "fixtures");
const handlerEntry = pathToFileURL(path.join(__dirname, "..", "dist", "handler.mjs")).href;
const runnerPath = path.join(fixtureDirectory, "published-handler-runner.mjs");
const tracePayloads: Buffer[] = [];

let agent: http.Server;
let resolveTrace: (() => void) | undefined;
let traceReceived: Promise<void>;

/**
 * @param {Buffer} body Encoded trace body.
 * @param {string | string[] | undefined} encoding Content encoding from the trace request.
 */
function recordTrace(body: Buffer, encoding: string | string[] | undefined): void {
  let payload = body;
  if (encoding === "gzip") {
    payload = zlib.gunzipSync(body);
  } else if (encoding === "deflate") {
    payload = zlib.inflateSync(body);
  }

  tracePayloads.push(payload);
  resolveTrace?.();
}

/**
 * @param {http.IncomingMessage} request Agent request.
 * @param {http.ServerResponse} response Agent response.
 */
function respond(request: http.IncomingMessage, response: http.ServerResponse): void {
  const chunks: Buffer[] = [];

  /** @param {Buffer} chunk Request body chunk. */
  function recordChunk(chunk: Buffer): void {
    chunks.push(chunk);
  }

  request.on("data", recordChunk);
  request.once("end", () => {
    response.setHeader("content-type", "application/json");

    if (request.url === "/info") {
      response.end(JSON.stringify({ endpoints: ["/v0.4/traces", "/v0.5/traces"] }));
      return;
    }

    if (request.url?.startsWith("/v0.4/traces") || request.url?.startsWith("/v0.5/traces")) {
      recordTrace(Buffer.concat(chunks), request.headers["content-encoding"]);
    }

    response.end(JSON.stringify({ rate_by_service: {} }));
  });
}

/** @param {() => void} resolve Trace promise resolver. */
function captureTraceResolver(resolve: () => void): void {
  resolveTrace = resolve;
}

/** @param {Promise<[unknown]>} messagePromise Child IPC message signal. */
async function readChildMessage(messagePromise: Promise<[unknown]>): Promise<unknown> {
  const [message] = await messagePromise;
  return message;
}

/** @param {boolean} traceEnabled Whether tracing is enabled for the child process. */
async function runPublishedHandler(traceEnabled: boolean): Promise<unknown> {
  const address = agent.address();
  if (address === null || typeof address === "string") {
    throw new Error("Mock agent is not listening on a TCP port");
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: "test-access-key",
    AWS_EXECUTION_ENV: `AWS_Lambda_nodejs${process.versions.node.split(".")[0]}.x`,
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE: "1024",
    AWS_LAMBDA_FUNCTION_VERSION: "$LATEST",
    AWS_REGION: "us-east-1",
    AWS_SECRET_ACCESS_KEY: "test-secret-key",
    DD_COLD_START_TRACING: "false",
    DD_INSTRUMENTATION_TELEMETRY_ENABLED: "false",
    DD_LAMBDA_HANDLER: "esm-instrumentation-handler.handle",
    DD_PROFILING_ENABLED: "false",
    DD_REMOTE_CONFIGURATION_ENABLED: "false",
    DD_RUNTIME_METRICS_ENABLED: "false",
    DD_TELEMETRY_ENABLED: "false",
    DD_TRACE_AGENT_URL: `http://127.0.0.1:${address.port}`,
    DD_TRACE_ENABLED: String(traceEnabled),
    DD_TRACE_STARTUP_LOGS: "false",
    LAMBDA_TASK_ROOT: fixtureDirectory,
    HANDLER_TEST_ENTRY: handlerEntry,
  };
  delete env.NODE_OPTIONS;
  delete env.OTEL_LOGS_EXPORTER;
  delete env.OTEL_METRICS_EXPORTER;
  delete env.OTEL_TRACES_EXPORTER;

  const child = spawn(process.execPath, [runnerPath], {
    env,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const closePromise = once(child, "close") as Promise<[number | null, NodeJS.Signals | null]>;
  const messagePromise = once(child, "message") as Promise<[unknown]>;
  let standardOutput = "";
  let standardError = "";

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");

  /** @param {string} chunk Standard output chunk. */
  function recordStandardOutput(chunk: string): void {
    standardOutput += chunk;
  }

  /** @param {string} chunk Standard error chunk. */
  function recordStandardError(chunk: string): void {
    standardError += chunk;
  }

  async function failOnEarlyClose(): Promise<never> {
    const [exitCode, signal] = await closePromise;
    throw new Error(
      `Published handler exited before completing the test: code=${exitCode}, signal=${signal}` +
        `\nstdout:\n${standardOutput}\nstderr:\n${standardError}`,
    );
  }

  child.stdout?.on("data", recordStandardOutput);
  child.stderr?.on("data", recordStandardError);
  const watchdog = setTimeout(() => child.kill("SIGKILL"), 15_000);
  watchdog.unref();

  try {
    const message = await Promise.race([readChildMessage(messagePromise), failOnEarlyClose()]);

    if (traceEnabled) {
      await Promise.race([traceReceived, failOnEarlyClose()]);
    }

    child.send("exit");
    const [exitCode, signal] = await closePromise;
    if (exitCode !== 0 || signal !== null) {
      throw new Error(`Published handler failed: code=${exitCode}, signal=${signal}\n${standardError}`);
    }

    return message;
  } finally {
    clearTimeout(watchdog);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }
}

const moduleWithRegister = Module as typeof Module & { register?: unknown };
const nodeMajor = Number(process.versions.node.split(".")[0]);
const supportsDurableFixture = nodeMajor >= 22 && typeof moduleWithRegister.register === "function";
const describeWithESMLoader = supportsDurableFixture ? describe : describe.skip;

describeWithESMLoader("published ESM handler", () => {
  jest.setTimeout(30_000);

  beforeAll(async () => {
    agent = http.createServer(respond);
    const listening = once(agent, "listening");
    agent.listen(0, "127.0.0.1");
    await listening;
  });

  afterAll(async () => {
    const closed = once(agent, "close");
    agent.close();
    await closed;
  });

  beforeEach(() => {
    tracePayloads.length = 0;
    traceReceived = new Promise(captureTraceResolver);
  });

  it("instruments an ESM durable handler through the published handler", async () => {
    const message = await runPublishedHandler(true);
    const payload = Buffer.concat(tracePayloads);

    expect(message).toEqual({
      registerLoaded: true,
      result: expect.objectContaining({ Status: "SUCCEEDED" }),
    });
    expect(payload.includes(Buffer.from("aws.lambda"))).toBe(true);
    expect(payload.includes(Buffer.from("aws.durable.execute"))).toBe(true);
  });

  it("does not register tracing when tracing is disabled", async () => {
    const message = await runPublishedHandler(false);

    expect(message).toEqual({
      registerLoaded: false,
      result: expect.objectContaining({ Status: "SUCCEEDED" }),
    });
    expect(tracePayloads).toHaveLength(0);
  });
});
