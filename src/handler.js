// CJS entry shim used by AWS Lambda's bootstrap when the handler string
// resolves to `node_modules/datadog-lambda-js/dist/handler.handler`.
//
// Lambda's resolver searches for `.js` before `.mjs`, so this file is what
// gets loaded for both CJS and ESM user functions. We branch at runtime:
//
//   - CJS user code: synchronously delegate to handler.cjs (preserves the
//     prior fast-path behavior — no extra dynamic import on cold start).
//
//   - ESM user code: expose an async handler that lazily `import()`s
//     handler.mjs on the first invocation. handler.mjs's async `load()`
//     transparently handles both CJS and ESM user modules, so this also
//     fixes the ERR_REQUIRE_ESM failure mode reported in
//     https://github.com/DataDog/datadog-lambda-js/issues/782.

"use strict";

const fs = require("fs");
const path = require("path");

function userIsEsm() {
  const handlerEnv = process.env.DD_LAMBDA_HANDLER || process.env._HANDLER || "";
  if (/\.mjs(\..*)?$/.test(handlerEnv)) {
    return true;
  }

  const taskRoot = process.env.LAMBDA_TASK_ROOT || process.cwd();
  try {
    const pkgPath = path.join(taskRoot, "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    if (pkg && pkg.type === "module") {
      return true;
    }
  } catch (_) {
    // package.json missing or unreadable — assume CJS, matches prior behavior.
  }

  return false;
}

if (userIsEsm()) {
  let cachedHandler;
  let cachedError;

  exports.handler = async function ddEsmHandler(event, context) {
    if (cachedError) {
      throw cachedError;
    }
    if (!cachedHandler) {
      try {
        const mod = await import("./handler.mjs");
        cachedHandler = mod.handler;
      } catch (error) {
        cachedError = error;
        throw error;
      }
    }
    return cachedHandler(event, context);
  };
} else {
  module.exports = require("./handler.cjs");
}
