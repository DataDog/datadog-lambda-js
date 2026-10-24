"use strict";

// Preload that mirrors how the tests observe loader registration. It wraps
// Module.register and Module.registerHooks so the runner can report which
// registration API dd-trace used. The file name intentionally contains no
// "dd-trace" reference so esmLoaderAlreadyRegistered does not match it.
const Module = require("node:module");

globalThis.__ddLoaderRegistrations = [];

const register = Module.register;
if (typeof register === "function") {
    Module.register = function (...args) {
        globalThis.__ddLoaderRegistrations.push("register");
        return register.apply(this, args);
    };
}

const registerHooks = Module.registerHooks;
if (typeof registerHooks === "function") {
    Module.registerHooks = function (...args) {
        globalThis.__ddLoaderRegistrations.push("registerHooks");
        return registerHooks.apply(this, args);
    };
}

Module.syncBuiltinESMExports();
