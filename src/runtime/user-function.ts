/**
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Modifications copyright 2021 Datadog, Inc.
 * 
 * The original file was part of aws-lambda-nodejs-runtime-interface-client
 * https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/main/src/utils/UserFunction.ts
 *
 * This module defines the functions for loading the user's code as specified
 * in a handler string.
 */

"use strict";

import path from "path";
import fs from "fs";
import {
  HandlerNotFound,
  MalformedHandlerName,
  ImportModuleError,
  UserCodeSyntaxError,
} from "./errors.js";
import { logDebug } from "../utils/log.js";

const module_importer = require("./module_importer");
const FUNCTION_EXPR = /^([^.]*)\.(.*)$/;
const RELATIVE_PATH_SUBSTRING = "..";

/**
 * Break the full handler string into two pieces, the module root and the actual
 * handler string.
 * Given './somepath/something/module.nestedobj.handler' this returns
 * ['./somepath/something', 'module.nestedobj.handler']
 */
function _moduleRootAndHandler(fullHandlerString: string): [string, string] {
  const handlerString = path.basename(fullHandlerString);
  const moduleRoot = fullHandlerString.substring(
    0,
    fullHandlerString.indexOf(handlerString)
  );
  return [moduleRoot, handlerString];
}

/**
 * Split the handler string into two pieces: the module name and the path to
 * the handler function.
 */
function _splitHandlerString(handler: string): [string, string] {
  const match = handler.match(FUNCTION_EXPR);
  if (!match || match.length != 3) {
    throw new MalformedHandlerName("Bad handler");
  }
  return [match[1], match[2]]; // [module, function-path]
}

/**
 * Resolve the user's handler function from the module.
 */
function _resolveHandler(object: any, nestedProperty: string): any {
  return nestedProperty.split(".").reduce((nested, key) => {
    return nested && nested[key];
  }, object);
}

function _tryRequireFile(file: string, extension?: string): any {
  const path = file + (extension || "");
  return fs.existsSync(path) ? require(path) : undefined;
}

async function _tryAwaitImport(file: string, extension: string): Promise<any> {
  const path = file + (extension || "");

  if (fs.existsSync(path)) {
    return await module_importer.import(path);
  }
}

function _hasFolderPackageJsonTypeModule(folder: string): boolean {
  // Check if package.json exists, return true if type === "module" in package json.
  // If there is no package.json, and there is a node_modules, return false.
  // Check parent folder otherwise, if there is one.
  if (folder.endsWith("/node_modules")) {
    return false;
  }
  const pj = path.join(folder, "/package.json");
  if (fs.existsSync(pj)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pj, "utf-8"));
      if (pkg) {
        if (pkg.type === "module") {
          return true;
        } else {
          return false;
        }
      }
    } catch (e) {
      console.warn(
        `${pj} cannot be read, it will be ignored for ES module detection purposes.`,
        e
      );
      return false;
    }
  }
  if (folder === "/") {
    // We have reached root without finding either a package.json or a node_modules.
    return false;
  }
  return _hasFolderPackageJsonTypeModule(path.resolve(folder, ".."));
}

function _hasPackageJsonTypeModule(file: string) {
  // File must have a .js extension
  const jsPath = file + ".js";
  return fs.existsSync(jsPath)
    ? _hasFolderPackageJsonTypeModule(path.resolve(path.dirname(jsPath)))
    : false;
}

/**
 * Attempt to load the user's module.
 * Attempts to directly resolve the module relative to the application root,
 * then falls back to the more general require().
 */
async function _tryRequire(appRoot: string, moduleRoot: string, module: string): Promise<any> {
  const lambdaStylePath = path.resolve(appRoot, moduleRoot, module);
  // Extensionless files are loaded via require.
  const extensionless = _tryRequireFile(lambdaStylePath);
  if (extensionless) {
    return extensionless;
  }
  // If package.json type != module, .js files are loaded via require.
  const pjHasModule = _hasPackageJsonTypeModule(lambdaStylePath);
  if (!pjHasModule) {
    const loaded = _tryRequireFile(lambdaStylePath, ".js");
    if (loaded) {
      return loaded;
    }
  }
  // If still not loaded, try .js, .mjs, and .cjs in that order.
  // Files ending with .js are loaded as ES modules when the nearest parent package.json
  // file contains a top-level field "type" with a value of "module".
  // https://nodejs.org/api/packages.html#packages_type
  const loaded =
    (pjHasModule && await _tryAwaitImport(lambdaStylePath, ".js")) ||
    await _tryAwaitImport(lambdaStylePath, ".mjs") ||
    _tryRequireFile(lambdaStylePath, ".cjs");
  if (loaded) {
    return loaded;
  }
  // Why not just require(module)?
  // Because require() is relative to __dirname, not process.cwd(). And the
  // runtime implementation is not located in /var/task
  // This won't work (yet) for esModules as import.meta.resolve is still experimental
  // See: https://nodejs.org/api/esm.html#esm_import_meta_resolve_specifier_parent
  const nodeStylePath = require.resolve(module, {
    paths: [appRoot, moduleRoot],
  });
  return require(nodeStylePath);
}

/**
 * Attempt to load the user's module.
 * Attempts to directly resolve the module relative to the application root,
 * then falls back to the more general require().
 */
function _tryRequireSync(appRoot: string, moduleRoot: string, module: string): Promise<any> {
  const lambdaStylePath = path.resolve(appRoot, moduleRoot, module);
  // Extensionless files are loaded via require.
  const extensionless = _tryRequireFile(lambdaStylePath);
  if (extensionless) {
    return extensionless;
  }
  // If package.json type != module, .js files are loaded via require.
  const pjHasModule = _hasPackageJsonTypeModule(lambdaStylePath);
  if (!pjHasModule) {
    const loaded = _tryRequireFile(lambdaStylePath, ".js");
    if (loaded) {
      return loaded;
    }
  }
  // If still not loaded, try .js, .mjs, and .cjs in that order.
  // Files ending with .js are loaded as ES modules when the nearest parent package.json
  // file contains a top-level field "type" with a value of "module".
  // https://nodejs.org/api/packages.html#packages_type
  const loaded = _tryRequireFile(lambdaStylePath, ".cjs");
  if (loaded) {
    return loaded;
  }
  // Why not just require(module)?
  // Because require() is relative to __dirname, not process.cwd(). And the
  // runtime implementation is not located in /var/task
  // This won't work (yet) for esModules as import.meta.resolve is still experimental
  // See: https://nodejs.org/api/esm.html#esm_import_meta_resolve_specifier_parent
  const nodeStylePath = require.resolve(module, {
    paths: [appRoot, moduleRoot],
  });
  return require(nodeStylePath);
}

/**
 * Load the user's application or throw a descriptive error.
 * @throws Runtime errors in two cases
 *   1 - UserCodeSyntaxError if there's a syntax error while loading the module
 *   2 - ImportModuleError if the module cannot be found
 */
async function _loadUserApp(
  appRoot: string,
  moduleRoot: string,
  module: string
): Promise<any> {
  try {
    return await _tryRequire(appRoot, moduleRoot, module);
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new UserCodeSyntaxError(<any>e);
      // @ts-ignore
    } else if (e.code !== undefined && e.code === "MODULE_NOT_FOUND") {
      // @ts-ignore
      throw new ImportModuleError(e);
    } else {
      throw e;
    }
  }
}

function _loadUserAppSync(
  appRoot: string,
  moduleRoot: string,
  module: string
): Promise<any> {
  try {
    return _tryRequireSync(appRoot, moduleRoot, module);
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new UserCodeSyntaxError(<any>e);
      // @ts-ignore
    } else if (e.code !== undefined && e.code === "MODULE_NOT_FOUND") {
      // @ts-ignore
      throw new ImportModuleError(e);
    } else {
      throw e;
    }
  }
}

function _throwIfInvalidHandler(fullHandlerString: string): void {
  if (fullHandlerString.includes(RELATIVE_PATH_SUBSTRING)) {
    throw new MalformedHandlerName(
      `'${fullHandlerString}' is not a valid handler name.Use absolute paths when specifying root directories in handler names.`
    );
  }
}

/**
 * Load the user's function with the approot and the handler string.
 * @param appRoot {string}
 *   The path to the application root.
 * @param handlerString {string}
 *   The user-provided handler function in the form 'module.function'.
 * @return userFuction {function}
 *   The user's handler function. This function will be passed the event body,
 *   the context object, and the callback function.
 * @throws In five cases:-
 *   1 - if the handler string is incorrectly formatted an error is thrown
 *   2 - if the module referenced by the handler cannot be loaded
 *   3 - if the function in the handler does not exist in the module
 *   4 - if a property with the same name, but isn't a function, exists on the
 *       module
 *   5 - the handler includes illegal character sequences (like relative paths
 *       for traversing up the filesystem '..')
 *   Errors for scenarios known by the runtime, will be wrapped by Runtime.* errors.
 */
export const load = async function (
  appRoot: string,
  fullHandlerString: string
) {
  _throwIfInvalidHandler(fullHandlerString);

  const [moduleRoot, moduleAndHandler] = _moduleRootAndHandler(
    fullHandlerString
  );
  const [module, handlerPath] = _splitHandlerString(moduleAndHandler);

  const userApp = await _loadUserApp(appRoot, moduleRoot, module);
  const handlerFunc = _resolveHandler(userApp, handlerPath);

  if (!handlerFunc) {
    throw new HandlerNotFound(
      `${fullHandlerString} is undefined or not exported`
    );
  }

  if (typeof handlerFunc !== "function") {
    throw new HandlerNotFound(`${fullHandlerString} is not a function`);
  }

  return handlerFunc;
};

/**
 * Load the user's function with the approot and the handler string.
 * @param appRoot {string}
 *   The path to the application root.
 * @param handlerString {string}
 *   The user-provided handler function in the form 'module.function'.
 * @return userFuction {function}
 *   The user's handler function. This function will be passed the event body,
 *   the context object, and the callback function.
 * @throws In five cases:-
 *   1 - if the handler string is incorrectly formatted an error is thrown
 *   2 - if the module referenced by the handler cannot be loaded
 *   3 - if the function in the handler does not exist in the module
 *   4 - if a property with the same name, but isn't a function, exists on the
 *       module
 *   5 - the handler includes illegal character sequences (like relative paths
 *       for traversing up the filesystem '..')
 *   Errors for scenarios known by the runtime, will be wrapped by Runtime.* errors.
 */
export const loadSync = function (
  appRoot: string,
  fullHandlerString: string
) {
  _throwIfInvalidHandler(fullHandlerString);

  const [moduleRoot, moduleAndHandler] = _moduleRootAndHandler(
    fullHandlerString
  );
  const [module, handlerPath] = _splitHandlerString(moduleAndHandler);

  const userApp = _loadUserAppSync(appRoot, moduleRoot, module);
  const handlerFunc = _resolveHandler(userApp, handlerPath);

  if (!handlerFunc) {
    throw new HandlerNotFound(
      `${fullHandlerString} is undefined or not exported`
    );
  }

  if (typeof handlerFunc !== "function") {
    throw new HandlerNotFound(`${fullHandlerString} is not a function`);
  }

  return handlerFunc;
};