#!/usr/bin/env node

// Prints the exact version selected by Yarn v1 for a dependency declared in
// the repository package.json. This keeps consumers that need an exact pin
// aligned with the lockfile without maintaining another version constant.

const fs = require("fs");
const path = require("path");

const dependency = process.argv[2];
if (!dependency) {
  console.error("usage: get_locked_dependency_version.js <dependency>");
  process.exit(2);
}

const repoDir = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, "package.json"), "utf8"));
const declaredVersion =
  (pkg.dependencies && pkg.dependencies[dependency]) ||
  (pkg.devDependencies && pkg.devDependencies[dependency]) ||
  (pkg.optionalDependencies && pkg.optionalDependencies[dependency]);

if (!declaredVersion) {
  throw new Error(`${dependency} is not declared in package.json`);
}

const selector = `${dependency}@${declaredVersion}`;
const lines = fs.readFileSync(path.join(repoDir, "yarn.lock"), "utf8").split(/\r?\n/);

function selectorsFromHeader(line) {
  const header = line.slice(0, -1);
  const matches = header.match(/"(?:\\.|[^"\\])*"|[^,]+/g) || [];
  return matches.map((match) => {
    const value = match.trim();
    return value.startsWith('"') ? JSON.parse(value) : value;
  });
}

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (/^\S.*:$/.test(line) && selectorsFromHeader(line).includes(selector)) {
    for (index += 1; index < lines.length && /^\s/.test(lines[index]); index += 1) {
      const version = lines[index].match(/^  version "([^"]+)"$/);
      if (version) {
        console.log(version[1]);
        process.exit(0);
      }
    }
    break;
  }
}

throw new Error(`cannot find ${selector} in yarn.lock`);
