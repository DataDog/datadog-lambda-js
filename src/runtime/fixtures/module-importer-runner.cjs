const assert = require("node:assert/strict");
const { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const Module = require("node:module");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");

const options = JSON.parse(process.argv[2]);
const temporary = mkdtempSync(join(tmpdir(), "lambda-register-mjs-"));
const shim = join(temporary, "node_modules/datadog-lambda-js");
const tracer = join(temporary, "node_modules/dd-trace");

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

async function run() {
  const expectsHooks = !options.broken && !options.disabled && !options.noLoader;
  write(
    join(shim, "runtime/index.js"),
    `exports.load = async (root, handler) => {
    const [file, name] = handler.split('.');
    return (await import(require('node:url').pathToFileURL(root + '/' + file + '.mjs')))[name];
  };`,
  );
  write(
    join(shim, "index.js"),
    `exports.datadog = handler => handler;
    exports.getEnvValue = (name, fallback) => process.env[name] ?? fallback;
    exports.datadogHandlerEnvVar = 'DD_LAMBDA_HANDLER';
    exports.lambdaTaskRootEnvVar = 'LAMBDA_TASK_ROOT';
    exports.traceExtractorEnvVar = 'DD_TRACE_EXTRACTOR';
    exports.emitTelemetryOnErrorOutsideHandler = async error => { throw error; };`,
  );
  write(
    join(shim, "utils/index.js"),
    `exports.logDebug = (message, metadata) => {
      if (metadata?.error) globalThis.registrationError = metadata.error.message;
    };
    exports.logError = () => {};
    exports.updateDDTags = () => '_dd.origin:lambda';`,
  );
  cpSync(join(__dirname, "../module_importer.js"), join(shim, "runtime/module_importer.js"));
  cpSync(join(__dirname, "../../handler.mjs"), join(shim, "handler.mjs"));
  write(
    join(tracer, "index.js"),
    `exports.init = options => {
      globalThis.initOptions = options;
      return exports;
    };
    exports.use = (name, options) => { globalThis.pluginOptions = { name, options }; };`,
  );
  if (!options.noRegister)
    write(
      join(tracer, "register.js"),
      options.broken && options.legacy
        ? "require('./missing-internal-dependency');"
        : `globalThis.commonjsRegistrations = (globalThis.commonjsRegistrations || 0) + 1;
       globalThis.instrumentationReady = true;`,
    );
  if (!options.legacy)
    write(
      join(tracer, "register.mjs"),
      options.broken
        ? "import './missing-internal-dependency.mjs';"
        : `await new Promise(setImmediate);
       if (!globalThis.instrumentationReady) {
         globalThis.esmRegistrations = (globalThis.esmRegistrations || 0) + 1;
         globalThis.instrumentationReady = true;
       }`,
    );
  write(join(tracer, "initialize.mjs"), "await import('./register.mjs');");
  write(
    join(tracer, "loader-hook.mjs"),
    `export async function load(url, context, nextLoad) {
    const result = await nextLoad(url, context);
    if (url.endsWith('/extractor.mjs') || url.endsWith('/customer.mjs')) {
      return { ...result, source: 'globalThis.instrumentationReady = true;\\n' + result.source };
    }
    return result;
  }`,
  );
  write(
    join(temporary, "customer.mjs"),
    `assertReady();
    function assertReady() {
      if (${expectsHooks} && !globalThis.instrumentationReady) {
        throw new Error('customer evaluated before hooks were installed');
      }
    }
    export const handler = async () => 'customer result';`,
  );
  write(
    join(temporary, "extractor.mjs"),
    `if (${expectsHooks} && !globalThis.instrumentationReady) {
      throw new Error('extractor evaluated before hooks were installed');
    }
    globalThis.extractorLoaded = true;
    export const extractor = () => ({});`,
  );
  process.env.LAMBDA_TASK_ROOT = temporary;
  process.env.DD_LAMBDA_HANDLER = "customer.handler";
  process.env.DD_TRACE_EXTRACTOR = "extractor.extractor";
  process.env.DD_TRACE_ENABLED = String(!options.disabled);
  let asyncRegistrations = 0;
  const register = Module.register;
  if (register)
    Module.register = (...args) => {
      asyncRegistrations++;
      return register(...args);
    };
  if (options.noLoader) delete Module.registerHooks;
  if (options.initialize) process.env.NODE_OPTIONS = `--import=${join(tracer, "initialize.mjs")}`;
  if (options.unrelatedPreload) process.env.NODE_OPTIONS = "--import=dd-trace/unrelated.mjs";
  if (options.preloaded) require(join(tracer, "register.js"));
  if (options.preloadedNoHooks) {
    write(join(tracer, "register.js"), "// CommonJS registration installed no hooks.\n");
    require(join(tracer, "register.js"));
  }
  if (options.withoutAsyncLoader || options.noLoader) {
    delete Module.register;
    Module.syncBuiltinESMExports();
  }
  const importer = require(join(shim, "runtime/module_importer.js"));
  if (options.concurrent) await Promise.all([importer.initTracer(), importer.initTracer()]);
  const { handler } = await import(pathToFileURL(join(shim, "handler.mjs")));
  assert.equal(await handler(), "customer result");
  assert.equal(globalThis.extractorLoaded, true);
  assert.equal(
    globalThis.commonjsRegistrations || 0,
    expectsHooks && !options.noRegister && (options.legacy || options.preloaded) ? 1 : 0,
  );
  assert.equal(globalThis.esmRegistrations || 0, expectsHooks && !options.legacy && !options.preloaded ? 1 : 0);
  assert.equal(asyncRegistrations, options.noRegister ? 1 : 0);
  if (!options.disabled) {
    assert.deepEqual(globalThis.initOptions, { tags: "_dd.origin:lambda" });
    assert.equal(globalThis.pluginOptions.name, "http");
    assert.ok(globalThis.pluginOptions.options.blocklist.test("http://127.0.0.1:8124/lambda/start-invocation"));
  }
  if (options.broken) assert.match(globalThis.registrationError, /missing-internal-dependency/);
}

run().then(
  () => rmSync(temporary, { recursive: true, force: true }),
  (error) => {
    rmSync(temporary, { recursive: true, force: true });
    console.error(error);
    process.exitCode = 1;
  },
);
