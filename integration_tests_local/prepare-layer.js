#!/usr/bin/env node

// Prepares the docker build context for the layer-mode fixture
// (integration_tests/container/layer/). Run by run.sh after `yarn build`;
// not meant to be run standalone (requires yarn install to have completed).
//
//   node prepare-layer.js <repo_dir> <layer_fixture_dir>
//
// Writes, mirroring the release Dockerfile's layer layout:
//   <layer_fixture_dir>/layer_pkg/          dist/ + handler.mjs + runtime/module_importer.js + package.json
//   <layer_fixture_dir>/deps.package.json   production deps + dd-trace, pinned to the installed versions
//
// Versions come from node_modules (i.e. the lockfile-resolved set), not from
// the ranges in package.json, so the fixture image build is reproducible and
// drifts with the repo instead of away from it.

const fs = require("fs");
const path = require("path");

const [repoDirArg, layerDirArg] = process.argv.slice(2);
if (!repoDirArg || !layerDirArg) {
  console.error("usage: node prepare-layer.js <repo_dir> <layer_fixture_dir>");
  process.exit(2);
}
const repoDir = path.resolve(repoDirArg);
const layerDir = path.resolve(layerDirArg);

const pkg = require(path.join(repoDir, "package.json"));

// 1. layer_pkg: dist/ contents + handler.mjs + the ESM module_importer overlay.
const layerPkgDir = path.join(layerDir, "layer_pkg");
fs.rmSync(layerPkgDir, { recursive: true, force: true });
fs.mkdirSync(path.join(layerPkgDir, "runtime"), { recursive: true });
fs.cpSync(path.join(repoDir, "dist"), layerPkgDir, { recursive: true });
fs.cpSync(path.join(repoDir, "src/handler.mjs"), path.join(layerPkgDir, "handler.mjs"));
// The release Dockerfile overlays the src (ESM) module_importer over the
// compiled dist one; keep the same order here.
fs.cpSync(
  path.join(repoDir, "src/runtime/module_importer.js"),
  path.join(layerPkgDir, "runtime/module_importer.js"),
);

// 2. layer package.json — same shape the release Dockerfile writes inline.
fs.writeFileSync(
  path.join(layerPkgDir, "package.json"),
  JSON.stringify({ name: pkg.name, version: pkg.version, main: "index.js", types: "index.d.ts" }, null, 2) + "\n",
);

// 3. deps.package.json: datadog-lambda-js's production dependencies plus
// dd-trace (which the release build moves from devDependencies), each pinned
// to the version yarn actually installed.
function installedVersion(name) {
  // Read the hoisted install location directly: require.resolve("<name>/package.json")
  // breaks on packages whose exports map doesn't expose ./package.json.
  const direct = path.join(repoDir, "node_modules", name, "package.json");
  if (fs.existsSync(direct)) {
    return JSON.parse(fs.readFileSync(direct, "utf-8")).version;
  }
  const entry = require.resolve(name, { paths: [repoDir] });
  let dir = path.dirname(entry);
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf-8"));
      if (parsed.name === name) return parsed.version;
    }
    dir = path.dirname(dir);
  }
  throw new Error(`cannot determine installed version of ${name}`);
}

const dependencies = {};
for (const name of Object.keys(pkg.dependencies || {})) {
  dependencies[name] = installedVersion(name);
}
dependencies["dd-trace"] = installedVersion("dd-trace");

fs.writeFileSync(
  path.join(layerDir, "deps.package.json"),
  JSON.stringify({ name: "layer-deps", private: true, dependencies }, null, 2) + "\n",
);

console.log(`Prepared layer fixture context in ${layerDir}`);
console.log(`  datadog-lambda-js ${pkg.version}, dd-trace ${dependencies["dd-trace"]}`);
