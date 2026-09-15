const { spawnSync } = require("node:child_process");
const path = require("node:path");

const yarn = process.platform === "win32" ? "yarn.cmd" : "yarn";

/**
 * @param {string[]} arguments_ Yarn arguments.
 * @param {string} [cwd] Working directory.
 */
function runYarn(arguments_, cwd) {
  const result = spawnSync(yarn, arguments_, { cwd, stdio: "inherit" });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runYarn(["build"]);

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 22) {
  runYarn(["install", "--frozen-lockfile"], path.join(__dirname, "..", "src", "runtime", "fixtures"));
}
